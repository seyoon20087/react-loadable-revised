"use strict";

// Tell React we are running in a test environment that supports act(...)
global.IS_REACT_ACT_ENVIRONMENT = true;

const path = require("path");
const React = require("react");
const renderer = require("react-test-renderer");
const { act } = renderer; // Destructure the act utility
const Loadable = require("../lib/index.cjs");

function waitFor(delay) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

function createLoader(delay, loader, error) {
  return () => {
    return waitFor(delay).then(() => {
      if (loader) {
        return loader();
      } else {
        throw error;
      }
    });
  };
}

function MyLoadingComponent(props) {
  return <div>MyLoadingComponent {JSON.stringify(props)}</div>;
}

function MyComponent(props) {
  return <div>MyComponent {JSON.stringify(props)}</div>;
}

afterEach(async () => {
  try {
    await act(async () => {
      await Loadable.preloadAll();
    });
  } catch (err) {}
});

test("loading success", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(400, () => MyComponent),
    loading: MyLoadingComponent,
  });

  let component1;
  // Wrap creation so componentDidMount's synchronous initialization finishes cleanly
  await act(async () => {
    component1 = renderer.create(<LoadableMyComponent prop="foo" />);
  });

  expect(component1.toJSON()).toMatchSnapshot(); // initial

  // Wrap wait steps so scheduled timeouts inside the component flush correctly
  await act(async () => {
    await waitFor(200);
  });
  expect(component1.toJSON()).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component1.toJSON()).toMatchSnapshot(); // loaded

  let component2;
  await act(async () => {
    component2 = renderer.create(<LoadableMyComponent prop="bar" />);
  });

  expect(component2.toJSON()).toMatchSnapshot(); // reload
});

test("delay and timeout", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(300, () => MyComponent),
    loading: MyLoadingComponent,
    delay: 100,
    timeout: 200,
  });

  let component1;
  await act(async () => {
    component1 = renderer.create(<LoadableMyComponent prop="foo" />);
  });

  expect(component1.toJSON()).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(100);
  });
  expect(component1.toJSON()).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(100);
  });
  expect(component1.toJSON()).toMatchSnapshot(); // timed out

  await act(async () => {
    await waitFor(100);
  });
  expect(component1.toJSON()).toMatchSnapshot(); // loaded
});

test("loading error", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(400, null, new Error("test error")),
    loading: MyLoadingComponent,
  });

  let component;
  await act(async () => {
    component = renderer.create(<LoadableMyComponent prop="baz" />);
  });

  expect(component.toJSON()).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // errored
});

test("server side rendering", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(400, () => require("../__fixtures__/component")),
    loading: MyLoadingComponent,
  });

  await act(async () => {
    await Loadable.preloadAll();
  });

  let component;
  await act(async () => {
    component = renderer.create(<LoadableMyComponent prop="baz" />);
  });

  expect(component.toJSON()).toMatchSnapshot(); // serverside
});

test("server side rendering es6", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(400, () => require("../__fixtures__/component.es6")),
    loading: MyLoadingComponent,
  });

  await act(async () => {
    await Loadable.preloadAll();
  });

  let component;
  await act(async () => {
    component = renderer.create(<LoadableMyComponent prop="baz" />);
  });

  expect(component.toJSON()).toMatchSnapshot(); // serverside
});

test("preload", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(400, () => MyComponent),
    loading: MyLoadingComponent,
  });

  let promise;
  await act(async () => {
    promise = LoadableMyComponent.preload();
    await waitFor(200);
  });

  let component1;
  await act(async () => {
    component1 = renderer.create(<LoadableMyComponent prop="baz" />);
  });

  expect(component1.toJSON()).toMatchSnapshot(); // still loading...

  await act(async () => {
    await promise;
  });
  expect(component1.toJSON()).toMatchSnapshot(); // success

  let component2;
  await act(async () => {
    component2 = renderer.create(<LoadableMyComponent prop="baz" />);
  });
  expect(component2.toJSON()).toMatchSnapshot(); // success
});

test("render", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(400, () => ({ MyComponent })),
    loading: MyLoadingComponent,
    render(loaded, props) {
      return <loaded.MyComponent {...props} />;
    },
  });

  let component;
  await act(async () => {
    component = renderer.create(<LoadableMyComponent prop="baz" />);
  });

  expect(component.toJSON()).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // success
});

test("loadable map success", async () => {
  let LoadableMyComponent = Loadable.Map({
    loader: {
      a: createLoader(200, () => ({ MyComponent })),
      b: createLoader(400, () => ({ MyComponent })),
    },
    loading: MyLoadingComponent,
    render(loaded, props) {
      return (
        <div>
          <loaded.a.MyComponent {...props} />
          <loaded.b.MyComponent {...props} />
        </div>
      );
    },
  });

  let component;
  await act(async () => {
    component = renderer.create(<LoadableMyComponent prop="baz" />);
  });

  expect(component.toJSON()).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // success
});

test("loadable map error", async () => {
  let LoadableMyComponent = Loadable.Map({
    loader: {
      a: createLoader(200, () => ({ MyComponent })),
      b: createLoader(400, null, new Error("test error")),
    },
    loading: MyLoadingComponent,
    render(loaded, props) {
      return (
        <div>
          <loaded.a.MyComponent {...props} />
          <loaded.b.MyComponent {...props} />
        </div>
      );
    },
  });

  let component;
  await act(async () => {
    component = renderer.create(<LoadableMyComponent prop="baz" />);
  });

  expect(component.toJSON()).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.toJSON()).toMatchSnapshot(); // success
});

describe("preloadReady", () => {
  beforeEach(() => {
    global.__webpack_modules__ = { 1: true, 2: true };
  });

  afterEach(() => {
    delete global.__webpack_modules__;
  });

  test("undefined", async () => {
    let LoadableMyComponent = Loadable({
      loader: createLoader(200, () => MyComponent),
      loading: MyLoadingComponent,
    });

    await act(async () => {
      await Loadable.preloadReady();
    });

    let component;
    await act(async () => {
      component = renderer.create(<LoadableMyComponent prop="baz" />);
    });

    expect(component.toJSON()).toMatchSnapshot();
  });

  test("one", async () => {
    let LoadableMyComponent = Loadable({
      loader: createLoader(200, () => MyComponent),
      loading: MyLoadingComponent,
      webpack: () => [1],
    });

    await act(async () => {
      await Loadable.preloadReady();
    });

    let component;
    await act(async () => {
      component = renderer.create(<LoadableMyComponent prop="baz" />);
    });

    expect(component.toJSON()).toMatchSnapshot();
  });

  test("many", async () => {
    let LoadableMyComponent = Loadable({
      loader: createLoader(200, () => MyComponent),
      loading: MyLoadingComponent,
      webpack: () => [1, 2],
    });

    await act(async () => {
      await Loadable.preloadReady();
    });

    let component;
    await act(async () => {
      component = renderer.create(<LoadableMyComponent prop="baz" />);
    });

    expect(component.toJSON()).toMatchSnapshot();
  });

  test("missing", async () => {
    let LoadableMyComponent = Loadable({
      loader: createLoader(200, () => MyComponent),
      loading: MyLoadingComponent,
      webpack: () => [1, 42],
    });

    await act(async () => {
      await Loadable.preloadReady();
    });

    let component;
    await act(async () => {
      component = renderer.create(<LoadableMyComponent prop="baz" />);
    });

    expect(component.toJSON()).toMatchSnapshot();
  });

  test("delay with 0", async () => {
    let LoadableMyComponent = Loadable({
      loader: createLoader(300, () => MyComponent),
      loading: MyLoadingComponent,
      delay: 0,
      timeout: 200,
    });

    let loadingComponent;
    await act(async () => {
      loadingComponent = renderer.create(<LoadableMyComponent prop="foo" />);
    });

    expect(loadingComponent.toJSON()).toMatchSnapshot(); // loading
  });
});
