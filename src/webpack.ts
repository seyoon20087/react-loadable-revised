// @ts-nocheck

import {
  default as ReactLoadablePlugin,
  getBundles as getBundlesAsObject,
} from "./ssr-addon";

export { ReactLoadablePlugin };

export const getBundles = (stats: any, modules: string[]) => {
  const bundles = getBundlesAsObject(stats, modules);
  const arrayToReturn: any[] = [];

  Object.keys(bundles).forEach((bundleExt) =>
    arrayToReturn.push(
      ...(Array.isArray(bundles[bundleExt]) ? bundles[bundleExt] : []),
    ),
  );

  return arrayToReturn;
};

export type * from "./webpack.d.ts";
