# Revised `react-loadable`

A drop-in replacement for upstream `react-loadable` that features:

- No `React.StrictMode` warnings (i.e. removed usage of legacy context and `UNSAFE_componentWillMount`)
- Webpack plugin tweaked to work with Webpack 4.41.1+ (also works with v5)
- Types included by default (NB: you should remove `@types/react-loadable`, if you have installed)

I published this because the legacy context API will be removed in React 19 (see [here][react-legacy-context-warn-1] and [here][react-legacy-context-warn-2]), which is not a good news for projects like [Docusaurus][docusaurus].

This package was published in the hope of resolving this issue like this.

## Note

Note that the version starts with `5.6.0` to match [semantic versioning][semver-link].

This package is intended as a _drop-in replacement_ for existing projects using `react-loadable`.
That is, I do NOT plan to add new features, or address tree-shaking issues.

For new projects I recommend using [`React.lazy`](https://react.dev/reference/react/lazy) or [`loadable-components`](https://loadable-components.com/) instead.

## Requirements

This package uses the new React Context API (and the `contextType` API), so your version of `react` needs to be 16.6.0 or later.

The Webpack plugin also requires 4.41.1+ or later (it also works on v5).

To install (if you're on yarn):

```yarn
yarn add react-loadable@npm:@seyoon20087/react-loadable
```

Note: The Babel plugin **will not work** if you install it via other means like `yarn install @seyoon20087/react-loadable` itself.

To test it on a current framework (like [Docusaurus][docusaurus]), use the [`resolutions`][yarn-resolutions] or [`overrides`][npm-overrides] feature in your `package.json`.

Example:
```json
{
  "resolutions": {
    "react-loadable": "npm:@seyoon20087/react-loadable"
  }
}
```

## API Reference

The API reference is identical, so you should be able to use it without updating your code.

For more information, please refer to the [upstream README](https://github.com/jamiebuilds/react-loadable/tree/master#------------api-docs).

The `Manifest` type from `react-loadable/webpack` is the only exception however I don't expect existing projects to break from working.

## License

This package is licensed under MIT -- see LICENSE in this repo for more details.


[react-legacy-context-warn-1]: https://github.com/facebook/react/blame/5998a775194f491afa5d3badd9afe9ceaf12845e/packages/react-reconciler/src/ReactFiberBeginWork.js#L1104-L1110C8
[react-legacy-context-warn-2]: https://github.com/facebook/react/blame/5998a775194f491afa5d3badd9afe9ceaf12845e/packages/react-reconciler/src/ReactFiberClassComponent.js#L413C5-L428C6
[docusaurus]: https://docusaurus.io/
[semver-link]: https://semver.org/
[npm-overrides]: https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides
[yarn-resolutions]: https://classic.yarnpkg.com/en/docs/selective-version-resolutions
