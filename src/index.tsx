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
declare const __webpack_modules__: any;

// Public Interface Definitions
export interface LoadingComponentProps {
  isLoading: boolean;
  pastDelay: boolean;
  timedOut: boolean;
  error: any;
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
  webpack?: (() => Array<string | number>) | null;
}

export interface OptionsWithoutRender<Props> extends CommonOptions {
  /**
   * Function returning a promise which returns a React component displayed on success.
   *
   * Resulting React component receives all the props passed to the generated component.
   */
  loader: () => Promise<
    ComponentType<Props> | { default: ComponentType<Props> }
  >;
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

  // NOTE: render is not optional if the loader return type is not compatible with the type
  // expected in `OptionsWithoutRender`. If you do not want to provide a render function, ensure that your
  // function is returning a promise for a React.ComponentType or is the result of import()ing a module
  // that has a component as its `default` export.
}

export type Options<Props, Exports extends object> =
  OptionsWithoutRender<Props> | OptionsWithRender<Props, Exports>;

export interface OptionsWithMap<
  Props,
  Exports extends { [key: string]: any },
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

  // Note: Changed return type from void to Promise<any> to match actual runtime behavior
  // and prevent compilation errors when awaiting preloads in tests.
  preload(): Promise<any>;
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
  error: any;
  promise: Promise<T>;
}

const ALL_INITIALIZERS: Array<() => Promise<any>> = [];
const READY_INITIALIZERS: Array<() => Promise<any> | undefined> = [];

function isWebpackReady(getModuleIds: () => Array<string | number>): boolean {
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

interface LoadableCaptureContextType {
  report: (moduleName: string) => void;
}

const LoadableCaptureContext = createContext<LoadableCaptureContextType | null>(
  null,
);

function load<T>(loader: () => Promise<T>): LoadState<T> {
  const promise = loader();

  const state: LoadState<T> = {
    loading: true,
    loaded: null,
    error: null,
    promise: null as any,
  };

  state.promise = promise
    .then((loaded) => {
      state.loading = false;
      state.loaded = loaded;
      return loaded;
    })
    .catch((err) => {
      state.loading = false;
      state.error = err;
      throw err;
    });

  return state;
}

function loadMap<T extends { [key: string]: () => Promise<any> }>(obj: T) {
  const state: {
    loading: boolean;
    loaded: { [K in keyof T]?: any };
    error: any;
    promise: Promise<any>;
  } = {
    loading: false,
    loaded: {},
    error: null,
    promise: null as any,
  };

  const promises: Array<Promise<any>> = [];

  try {
    Object.keys(obj).forEach((key) => {
      const result = load(obj[key]);

      if (!result.loading) {
        state.loaded[key as keyof T] = result.loaded;
        state.error = result.error;
      } else {
        state.loading = true;
      }

      promises.push(result.promise);

      result.promise
        .then((res) => {
          state.loaded[key as keyof T] = res;
        })
        .catch((err) => {
          state.error = err;
        });
    });
  } catch (err) {
    state.error = err;
  }

  state.promise = Promise.all(promises)
    .then((res) => {
      state.loading = false;
      return res;
    })
    .catch((err) => {
      state.loading = false;
      throw err;
    });

  return state;
}

function resolve(obj: any): any {
  return obj && obj.__esModule ? obj.default : obj;
}

function render<Props>(loaded: any, props: Props): ReactNode {
  const ResolvedComponent = resolve(loaded);
  return <ResolvedComponent {...props} />;
}

interface ComponentState {
  error: any;
  pastDelay: boolean;
  timedOut: boolean;
  loading: boolean;
  loaded: any;
}

function createLoadableComponent<Props>(
  loadFn: (loader: any) => any,
  options: any,
): ComponentClass<Props> & LoadableComponent {
  if (!options.loading) {
    throw new Error("react-loadable requires a `loading` component");
  }

  const opts = Object.assign(
    {
      loader: null,
      loading: null,
      delay: 200,
      timeout: null,
      render: render,
      webpack: null,
      modules: null,
    },
    options,
  );

  let res: any = null;

  function init() {
    if (!res) {
      res = loadFn(opts.loader);
    }
    return res.promise;
  }

  ALL_INITIALIZERS.push(init);

  if (typeof opts.webpack === "function") {
    READY_INITIALIZERS.push(() => {
      if (isWebpackReady(opts.webpack)) {
        return init();
      }
    });
  }

  return class LoadableComponent extends Component<Props, ComponentState> {
    private _mounted = false;
    // ReturnType<typeof setTimeout> safely handles both Node.js SSR and Browser timers
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
        opts.modules.forEach((moduleName: string) => {
          this.context!.report(moduleName);
        });
      }

      this.state = {
        error: res.error,
        pastDelay: false,
        timedOut: false,
        loading: res.loading,
        loaded: res.loaded,
      };
    }

    static preload() {
      return init();
    }

    componentDidMount() {
      this._mounted = true;
      this._loadModule();
    }

    _loadModule() {
      if (!res.loading) {
        return;
      }

      const setStateWithMountCheck = (newState: Partial<ComponentState>) => {
        if (!this._mounted) {
          return;
        }
        this.setState(newState as ComponentState);
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
          error: res.error,
          loaded: res.loaded,
          loading: res.loading,
        });

        this._clearTimeouts();
      };

      res.promise
        .then(() => {
          update();
          return null;
        })
        .catch((_err: any) => {
          update();
          return null;
        });
    }

    componentWillUnmount() {
      this._mounted = false;
      this._clearTimeouts();
    }

    _clearTimeouts() {
      clearTimeout(this._delay);
      clearTimeout(this._timeout);
    }

    retry = () => {
      this.setState({ error: null, loading: true, timedOut: false });
      res = loadFn(opts.loader);
      this._loadModule();
    };

    preload() {
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
  } as any;
}

// Main Loadable Factory Function Overloads
function Loadable<Props, Exports extends object>(
  options: Options<Props, Exports>,
): ComponentType<Props> & LoadableComponent {
  return createLoadableComponent(load, options);
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

function LoadableMap<Props, Exports extends { [key: string]: any }>(
  options: OptionsWithMap<Props, Exports>,
): ComponentType<Props> & LoadableComponent {
  if (typeof options.render !== "function") {
    throw new Error("LoadableMap requires a `render(loaded, props)` function");
  }

  return createLoadableComponent(loadMap, options);
}

Loadable.Map = LoadableMap;

const Capture: FC<LoadableCaptureProps> = ({ report, children }) => (
  <LoadableCaptureContext.Provider value={{ report }}>
    {Children.only(children)}
  </LoadableCaptureContext.Provider>
);

Loadable.Capture = Capture;

function flushInitializers(
  initializers: Array<() => Promise<any> | undefined>,
): any {
  const promises: Array<Promise<any>> = [];

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
    if (initializers.length) {
      return flushInitializers(initializers);
    }
  });
}

const preloadAll = (): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    flushInitializers(ALL_INITIALIZERS).then(() => resolve(), reject);
  });
};

Loadable.preloadAll = preloadAll;

const preloadReady = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    // We always will resolve, errors should be handled within loading UIs.
    flushInitializers(READY_INITIALIZERS).then(
      () => resolve(),
      () => resolve(),
    );
  });
};

Loadable.preloadReady = preloadReady;

export default Loadable;
