import path from "path";
import * as React from "react";
import { render, act } from "@testing-library/react";
import Loadable from "../src/index.tsx";

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
    component1 = render(<LoadableMyComponent prop="foo" />);
  });

  expect(component1.container.firstChild).toMatchSnapshot(); // initial

  // Wrap wait steps so scheduled timeouts inside the component flush correctly
  await act(async () => {
    await waitFor(200);
  });
  expect(component1.container.firstChild).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component1.container.firstChild).toMatchSnapshot(); // loaded

  let component2;
  await act(async () => {
    component2 = render(<LoadableMyComponent prop="bar" />);
  });

  expect(component2.container.firstChild).toMatchSnapshot(); // reload
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
    component1 = render(<LoadableMyComponent prop="foo" />);
  });

  expect(component1.container.firstChild).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(100);
  });
  expect(component1.container.firstChild).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(100);
  });
  expect(component1.container.firstChild).toMatchSnapshot(); // timed out

  await act(async () => {
    await waitFor(100);
  });
  expect(component1.container.firstChild).toMatchSnapshot(); // loaded
});

test("loading error", async () => {
  let LoadableMyComponent = Loadable({
    loader: createLoader(400, null, new Error("test error")),
    loading: MyLoadingComponent,
  });

  let component;
  await act(async () => {
    component = render(<LoadableMyComponent prop="baz" />);
  });

  expect(component.container.firstChild).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // errored
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
    component = render(<LoadableMyComponent prop="baz" />);
  });

  expect(component.container.firstChild).toMatchSnapshot(); // serverside
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
    component = render(<LoadableMyComponent prop="baz" />);
  });

  expect(component.container.firstChild).toMatchSnapshot(); // serverside
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
    component1 = render(<LoadableMyComponent prop="baz" />);
  });

  expect(component1.container.firstChild).toMatchSnapshot(); // still loading...

  await act(async () => {
    await promise;
  });
  expect(component1.container.firstChild).toMatchSnapshot(); // success

  let component2;
  await act(async () => {
    component2 = render(<LoadableMyComponent prop="baz" />);
  });
  expect(component2.container.firstChild).toMatchSnapshot(); // success
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
    component = render(<LoadableMyComponent prop="baz" />);
  });

  expect(component.container.firstChild).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // success
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
    component = render(<LoadableMyComponent prop="baz" />);
  });

  expect(component.container.firstChild).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // success
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
    component = render(<LoadableMyComponent prop="baz" />);
  });

  expect(component.container.firstChild).toMatchSnapshot(); // initial

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // loading

  await act(async () => {
    await waitFor(200);
  });
  expect(component.container.firstChild).toMatchSnapshot(); // success
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
      component = render(<LoadableMyComponent prop="baz" />);
    });

    expect(component.container.firstChild).toMatchSnapshot();
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
      component = render(<LoadableMyComponent prop="baz" />);
    });

    expect(component.container.firstChild).toMatchSnapshot();
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
      component = render(<LoadableMyComponent prop="baz" />);
    });

    expect(component.container.firstChild).toMatchSnapshot();
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
      component = render(<LoadableMyComponent prop="baz" />);
    });

    expect(component.container.firstChild).toMatchSnapshot();
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
      loadingComponent = render(<LoadableMyComponent prop="foo" />);
    });

    expect(loadingComponent.container.firstChild).toMatchSnapshot(); // loading
  });
});
