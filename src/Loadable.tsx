// @ts-nocheck

import React from "react";

const ALL_INITIALIZERS = [];
const READY_INITIALIZERS = [];

const CaptureContext = React.createContext(undefined);

function isWebpackReady(getModuleIds) {
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

function load(loader) {
  let promise = loader();

  let state = {
    loading: true,
    loaded: null,
    error: null,
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

function loadMap(obj) {
  let state = {
    loading: false,
    loaded: {},
    error: null,
  };

  let promises = [];

  try {
    Object.keys(obj).forEach((key) => {
      let result = load(obj[key]);

      if (!result.loading) {
        state.loaded[key] = result.loaded;
        state.error = result.error;
      } else {
        state.loading = true;
      }

      promises.push(result.promise);

      result.promise
        .then((res) => {
          state.loaded[key] = res;
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

function resolve(obj) {
  return obj && obj.__esModule ? obj.default : obj;
}

function render(loaded, props) {
  const Loaded = resolve(loaded);
  return <Loaded {...props} />;
}

function createLoadableComponent(loadFn, options) {
  if (!options.loading) {
    throw new Error("react-loadable requires a `loading` component");
  }

  let opts = Object.assign(
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

  let res = null;

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

  return class LoadableComponent extends React.Component {
    constructor(props) {
      super(props);
      init();

      this.state = {
        error: res.error,
        pastDelay: false,
        timedOut: false,
        loading: res.loading,
        loaded: res.loaded,
      };

      this._componentWillMount();
    }

    static contextType = CaptureContext;

    static preload() {
      return init();
    }

    loaded = false;

    _componentWillMount() {
      this._loadModule();
    }

    componentDidMount() {
      this._mounted = true;
    }

    _loadModule() {
      if (this.loaded) return;

      this.loaded = true;

      if (this.context?.loadable && Array.isArray(opts.modules)) {
        opts.modules.forEach((moduleName) => {
          this.context.loadable.report(moduleName);
        });
      }

      if (!res.loading) {
        return;
      }

      let setStateWithMountCheck = (newState) => {
        if (!this._mounted) {
          return;
        }

        this.setState(newState);
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

      let update = () => {
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
        .catch((err) => {
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

    render() {
      if (this.state.loading || this.state.error) {
        return (
          <opts.loading
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

function Loadable(opts) {
  return createLoadableComponent(load, opts);
}

function LoadableMap(opts) {
  if (typeof opts.render !== "function") {
    throw new Error("LoadableMap requires a `render(loaded, props)` function");
  }

  return createLoadableComponent(loadMap, opts);
}

Loadable.Map = LoadableMap;

class Capture extends React.Component {
  _getChildContext() {
    return {
      loadable: {
        report: this.props.report,
      },
    };
  }

  render() {
    return (
      <CaptureContext.Provider value={this._getChildContext()}>
        {this.props.children}
      </CaptureContext.Provider>
    );
  }
}

Loadable.Capture = Capture;

function flushInitializers(initializers) {
  let promises = [];

  while (initializers.length) {
    let init = initializers.pop();
    promises.push(init());
  }

  return Promise.all(promises).then(() => {
    if (initializers.length) {
      return flushInitializers(initializers);
    }
  });
}

Loadable.preloadAll = () => {
  return new Promise((resolve, reject) => {
    flushInitializers(ALL_INITIALIZERS).then(resolve, reject);
  });
};

Loadable.preloadReady = () => {
  return new Promise((resolve, reject) => {
    // We always will resolve, errors should be handled within loading UIs.
    flushInitializers(READY_INITIALIZERS).then(resolve, resolve);
  });
};

export default Loadable;
export type * from "./index.d.ts";
