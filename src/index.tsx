import {
  createContext,
  Component,
  Children,
  type ReactNode,
  type ComponentType,
  type ComponentClass,
  type FC,
  type ContextType,
} from "react";

// Webpack global module registry declaration
declare const __webpack_modules__: Record<string | number, unknown> | undefined;

// Public Interface Definitions
export interface LoadingComponentProps {
  isLoading: boolean;
  pastDelay: boolean;
  timedOut: boolean;
  error: unknown;
  retry: () => void;
}

export interface CommonOptions {
  /**
   * React component displayed after delay until loader() succeeds. Also responsible for displaying errors.
   *
   * If you don't want to render anything you can pass a function that returns null
   * (this is considered a valid React component).
   */
  loading: ComponentType<LoadingComponentProps>;
  /**
   * Defaults to 200, in milliseconds.
   *
   * Only show the loading component if the loader() has taken this long to succeed or error.
   */
  delay?: number | false | null;
  /**
   * Disabled by default.
   *
   * After the specified time in milliseconds passes, the component's `timedOut` prop will be set to true.
   */
  timeout?: number | false | null;

  /**
   * Optional array of module paths that `Loadable.Capture`'s `report` function will be applied on during
   * server-side rendering. This helps the server know which modules were imported/used during SSR.
   * ```ts
   * Loadable({
   *   loader: () => import('./my-component'),
   *   modules: ['./my-component'],
   * });
   * ```
   */
  modules?: string[] | null;

  /**
   * An optional function which returns an array of Webpack module ids which you can get
   * with require.resolveWeak. This is used by the client (inside `Loadable.preloadReady`) to
   * guarantee each webpack module is preloaded before the first client render.
   * ```ts
   * Loadable({
   *  loader: () => import('./Foo'),
   *  webpack: () => [require.resolveWeak('./Foo')],
   * });
   * ```
   */
  webpack?: (() => (string | number)[]) | null;
}

type ResolvableComponent<Props> =
  | ComponentType<Props>
  | { default: ComponentType<Props>; __esModule?: boolean };

export interface OptionsWithoutRender<Props> extends CommonOptions {
  /**
   * Function returning a promise which returns a React component displayed on success.
   *
   * Resulting React component receives all the props passed to the generated component.
   */
  loader: () => Promise<ResolvableComponent<Props>>;
}

export interface OptionsWithRender<
  Props,
  Exports extends object,
> extends CommonOptions {
  /**
   * Function returning a promise which returns an object to be passed to `render` on success.
   */
  loader: () => Promise<Exports>;
  /**
   * If you want to customize what gets rendered from your loader you can also pass `render`.
   *
   * Note: If you want to load multiple resources at once, you can also use `Loadable.Map`.
   *
   * ```ts
   * Loadable({
   *     // ...
   *     render(loaded, props) {
   *         const Component = loaded.default;
   *         return <Component {...props} />
   *     }
   * });
   * ```
   */
  render(loaded: Exports, props: Props): ReactNode;
}

export type Options<Props, Exports extends object> =
  | OptionsWithoutRender<Props>
  | OptionsWithRender<Props, Exports>;

export interface OptionsWithMap<
  Props,
  Exports extends Record<string, unknown>,
> extends CommonOptions {
  /**
   * An object containing functions which return promises, which resolve to an object to be passed to `render` on success.
   */
  loader: {
    [P in keyof Exports]: () => Promise<Exports[P]>;
  };
  /**
   * If you want to customize what gets rendered from your loader you can also pass `render`.
   *
   * Note: If you want to load multiple resources at once, you can also use `Loadable.Map`.
   *
   * ```ts
   * Loadable({
   *     // ...
   *     render(loaded, props) {
   *         const Component = loaded.default;
   *         return <Component {...props} />
   *     }
   * });
   * ```
   */
  render(loaded: Exports, props: Props): ReactNode;
}

export interface LoadableComponent {
  /**
   * The generated component has a static method preload() for calling the loader function ahead of time.
   * This is useful for scenarios where you think the user might do something next and want to load the
   * next component eagerly.
   */
  preload(): Promise<unknown>;
}

export interface LoadableCaptureProps {
  /**
   * Function called for every moduleName that is rendered via React Loadable.
   */
  report: (moduleName: string) => void;
  children: ReactNode;
}

// Internal State Tracker Structures
interface LoadState<T> {
  loading: boolean;
  loaded: T | null;
  error: unknown;
  promise: Promise<T>;
}

type Initializer = () => Promise<unknown> | undefined;

const ALL_INITIALIZERS: (() => Promise<unknown>)[] = [];
const READY_INITIALIZERS: Initializer[] = [];

function isWebpackReady(getModuleIds: () => (string | number)[]): boolean {
  if (typeof __webpack_modules__ !== "object") {
    return false;
  }

  return getModuleIds().every((moduleId) => {
    return (
      typeof moduleId !== "undefined" &&
      typeof __webpack_modules__[moduleId] !== "undefined"
    );
  });
}

type LoadableCaptureContextType = (moduleName: string) => void;

const LoadableCaptureContext = createContext<LoadableCaptureContextType | null>(
  null,
);

function load<T>(loader: () => Promise<T>): LoadState<T> {
  const promise = loader();

  const state: LoadState<T> = {
    loading: true,
    loaded: null,
    error: null,
    promise: promise
      .then((loaded) => {
        state.loading = false;
        state.loaded = loaded;
        return loaded;
      })
      .catch((err) => {
        state.loading = false;
        state.error = err;
        throw err;
      }),
  };

  return state;
}

function loadMap<Exports extends Record<string, unknown>>(obj: {
  [K in keyof Exports]: () => Promise<Exports[K]>;
}): LoadState<Exports> {
  const loadedMap = {} as Partial<Exports>;
  const promises: Promise<unknown>[] = [];

  const state: Partial<LoadState<Exports>> = {
    loading: false,
    loaded: loadedMap as Exports,
    error: null,
  };

  try {
    const keys = Object.keys(obj) as (keyof Exports)[];
    keys.forEach((key) => {
      const result = load(obj[key]);

      if (!result.loading) {
        loadedMap[key] = result.loaded!;
        state.error = result.error;
      } else {
        state.loading = true;
      }

      promises.push(result.promise);

      result.promise
        .then((res) => {
          loadedMap[key] = res;
        })
        .catch((err: unknown) => {
          state.error = err;
        });
    });
  } catch (err) {
    state.error = err;
  }

  state.promise = Promise.all(promises)
    .then(() => {
      state.loading = false;
      return loadedMap as Exports;
    })
    .catch((err: unknown) => {
      state.loading = false;
      throw err;
    });

  return state as LoadState<Exports>;
}

function resolve<Props extends object>(
  obj: ResolvableComponent<Props>,
): ComponentType<Props> {
  if (
    obj &&
    typeof obj === "object" &&
    "__esModule" in obj &&
    obj.__esModule &&
    "default" in obj
  ) {
    return obj.default;
  }
  return obj as ComponentType<Props>;
}

function render<Props extends object>(
  loaded: ResolvableComponent<Props>,
  props: Props,
): ReactNode {
  const ResolvedComponent = resolve(loaded);
  return <ResolvedComponent {...props} />;
}

interface ComponentState<Loaded> {
  error: unknown;
  pastDelay: boolean;
  timedOut: boolean;
  loading: boolean;
  loaded: Loaded | null;
}

interface LoadableBaseOptions<Props, Loaded, Loader> extends CommonOptions {
  loader: Loader;
  render?: (loaded: Loaded, props: Props) => ReactNode;
}

function createLoadableComponent<Props, Loaded, Loader>(
  loadFn: (loader: Loader) => LoadState<Loaded>,
  options: LoadableBaseOptions<Props, Loaded, Loader>,
): ComponentClass<Props, ComponentState<Loaded>> & LoadableComponent {
  const {
    loader,
    loading,
    delay = 200,
    timeout = null,
    render: renderFn = render as unknown as (
      loaded: Loaded,
      props: Props,
    ) => ReactNode,
    webpack = null,
    modules = null,
    ...restOptions
  } = options;

  if (!loading) {
    throw new Error("react-loadable requires a `loading` component");
  }

  const opts = {
    loader,
    loading,
    delay,
    timeout,
    render: renderFn,
    webpack,
    modules,
    ...restOptions,
  };

  let res: LoadState<Loaded> | null = null;

  function init(): Promise<Loaded> {
    if (!res) {
      res = loadFn(opts.loader);
    }
    return res.promise;
  }

  ALL_INITIALIZERS.push(init);

  if (typeof opts.webpack === "function") {
    READY_INITIALIZERS.push(() => {
      return typeof opts.webpack === "function" && isWebpackReady(opts.webpack)
        ? init()
        : undefined;
    });
  }

  return class LoadableComponent extends Component<
    Props,
    ComponentState<Loaded>
  > {
    private _mounted = false;
    private _delay?: ReturnType<typeof setTimeout>;
    private _timeout?: ReturnType<typeof setTimeout>;

    static contextType = LoadableCaptureContext;
    declare context: ContextType<typeof LoadableCaptureContext>;

    constructor(props: Props) {
      super(props);
      init();

      // SSR Reporting: Must happen in constructor because
      // componentDidMount doesn't run on the server.
      if (this.context && Array.isArray(opts.modules)) {
        const report = this.context;
        for (const moduleName of opts.modules) {
          report(moduleName);
        }
      }

      this.state = {
        error: res!.error,
        pastDelay: false,
        timedOut: false,
        loading: res!.loading,
        loaded: res!.loaded,
      };
    }

    static preload(): Promise<Loaded> {
      return init();
    }

    componentDidMount() {
      this._mounted = true;
      this._loadModule();
    }

    private _loadModule() {
      if (!res!.loading) {
        return;
      }

      const setStateWithMountCheck = (
        newState: Partial<ComponentState<Loaded>>,
      ) => {
        if (!this._mounted) {
          return;
        }
        this.setState(newState as ComponentState<Loaded>);
      };

      if (typeof opts.delay === "number") {
        if (opts.delay === 0) {
          this.setState({ pastDelay: true });
        } else {
          this._delay = setTimeout(() => {
            setStateWithMountCheck({ pastDelay: true });
          }, opts.delay);
        }
      }

      if (typeof opts.timeout === "number") {
        this._timeout = setTimeout(() => {
          setStateWithMountCheck({ timedOut: true });
        }, opts.timeout);
      }

      const update = () => {
        setStateWithMountCheck({
          error: res!.error,
          loaded: res!.loaded,
          loading: res!.loading,
        });

        this._clearTimeouts();
      };

      res!.promise
        .then(() => {
          update();
          return null;
        })
        .catch((_err: unknown) => {
          update();
          return null;
        });
    }

    componentWillUnmount() {
      this._mounted = false;
      this._clearTimeouts();
    }

    private _clearTimeouts() {
      if (this._delay) clearTimeout(this._delay);
      if (this._timeout) clearTimeout(this._timeout);
    }

    retry = () => {
      this.setState({ error: null, loading: true, timedOut: false });
      res = loadFn(opts.loader);
      this._loadModule();
    };

    preload(): Promise<Loaded> {
      return init();
    }

    render() {
      if (this.state.loading || this.state.error) {
        const LoadingComponent = opts.loading;
        return (
          <LoadingComponent
            isLoading={this.state.loading}
            pastDelay={this.state.pastDelay}
            timedOut={this.state.timedOut}
            error={this.state.error}
            retry={this.retry}
          />
        );
      } else if (this.state.loaded) {
        return opts.render(this.state.loaded, this.props);
      } else {
        return null;
      }
    }
  };
}

// Main Loadable Factory Function Overloads
function Loadable<Props, Exports extends object>(
  options: OptionsWithRender<Props, Exports>,
): ComponentClass<Props> & LoadableComponent;
function Loadable<Props>(
  options: OptionsWithoutRender<Props>,
): ComponentClass<Props> & LoadableComponent;
function Loadable<Props, Exports extends object>(
  options: Options<Props, Exports>,
): ComponentClass<Props> & LoadableComponent {
  return createLoadableComponent(
    load,
    options as LoadableBaseOptions<
      Props,
      Exports | ResolvableComponent<Props>,
      () => Promise<Exports | ResolvableComponent<Props>>
    >,
  );
}
declare namespace Loadable {
  export let Map: typeof LoadableMap;
  export let Capture: FC<LoadableCaptureProps>;

  /**
   * This will call all of the LoadableComponent.preload methods recursively until they are all
   * resolved. Allowing you to preload all of your dynamic modules in environments like the server.
   * ```ts
   * Loadable.preloadAll().then(() => {
   *   app.listen(3000, () => {
   *     console.log('Running on http://localhost:3000/');
   *   });
   * });
   * ```
   */
  export let preloadAll: () => Promise<void>;

  /**
   * Check for modules that are already loaded in the browser and call the matching
   * `LoadableComponent.preload` methods.
   * ```ts
   * window.main = () => {
   *   Loadable.preloadReady().then(() => {
   *     ReactDOM.hydrate(
   *       <App/>,
   *       document.getElementById('app'),
   *     );
   *   });
   * };
   * ```
   */
  export let preloadReady: () => Promise<void>;
}

function LoadableMap<Props, Exports extends Record<string, unknown>>(
  options: OptionsWithMap<Props, Exports>,
): ComponentClass<Props> & LoadableComponent {
  if (typeof options.render !== "function") {
    throw new Error("LoadableMap requires a `render(loaded, props)` function");
  }

  return createLoadableComponent(loadMap, options);
}

Loadable.Map = LoadableMap;

const Capture: FC<LoadableCaptureProps> = ({ report, children }) => (
  <LoadableCaptureContext.Provider value={report}>
    {Children.only(children)}
  </LoadableCaptureContext.Provider>
);

Loadable.Capture = Capture;

function flushInitializers(initializers: Initializer[]): Promise<void> {
  const promises: Promise<unknown>[] = [];

  while (initializers.length) {
    const init = initializers.pop();
    if (init) {
      const res = init();
      if (res && typeof res.then === "function") {
        promises.push(res);
      }
    }
  }

  return Promise.all(promises).then(() => {
    return initializers.length ? flushInitializers(initializers) : undefined;
  });
}

const preloadAll = (): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    flushInitializers(ALL_INITIALIZERS).then(resolve, reject);
  });
};

Loadable.preloadAll = preloadAll;

const preloadReady = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    // We always will resolve, errors should be handled within loading UIs.
    flushInitializers(READY_INITIALIZERS).then(resolve, resolve);
  });
};

Loadable.preloadReady = preloadReady;

export default Loadable;
