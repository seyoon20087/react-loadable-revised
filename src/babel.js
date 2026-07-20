export default function ({ types: t }) {
  return {
    visitor: {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        if (source !== "react-loadable") return;

        const defaultSpecifier = path.get("specifiers").find((specifier) => {
          return specifier.isImportDefaultSpecifier();
        });

        if (!defaultSpecifier) return;

        const bindingName = defaultSpecifier.node.local.name;
        const binding = path.scope.getBinding(bindingName);

        binding.referencePaths.forEach((refPath) => {
          let callExpression = refPath.parentPath;

          if (
            callExpression.isMemberExpression() &&
            callExpression.node.computed === false &&
            callExpression.get("property").isIdentifier({ name: "Map" })
          ) {
            callExpression = callExpression.parentPath;
          }

          if (!callExpression.isCallExpression()) return;

          const args = callExpression.get("arguments");
          if (args.length !== 1) throw callExpression.error;

          const options = args[0];
          if (!options.isObjectExpression()) return;

          const properties = options.get("properties");
          const propertiesMap = {};

          properties.forEach((property) => {
            // Safer check: Only map properties that actually have a named identifier key
            if (property.isObjectProperty() || property.isObjectMethod()) {
              const key = property.get("key");
              if (key.isIdentifier()) {
                propertiesMap[key.node.name] = property;
              }
            }
          });

          if (propertiesMap.webpack) {
            return;
          }

          const loaderMethod = propertiesMap.loader.get("value");
          const dynamicImports = [];

          // Traverse using visitors for both Babel v7 (Import) and Babel v8 (ImportExpression)
          loaderMethod.traverse({
            Import(path) {
              const callExpr = path.parentPath;
              if (callExpr.isCallExpression()) {
                dynamicImports.push({
                  sourceNode: callExpr.get("arguments")[0].node,
                });
              }
            },
            ImportExpression(path) {
              dynamicImports.push({
                sourceNode: path.get("source").node,
              });
            },
          });

          if (!dynamicImports.length) return;

          propertiesMap.loader.insertAfter(
            t.objectProperty(
              t.identifier("webpack"),
              t.arrowFunctionExpression(
                [],
                t.arrayExpression(
                  dynamicImports.map((dynamicImport) => {
                    return t.callExpression(
                      t.memberExpression(
                        t.identifier("require"),
                        t.identifier("resolveWeak"),
                      ),
                      [dynamicImport.sourceNode],
                    );
                  }),
                ),
              ),
            ),
          );

          propertiesMap.loader.insertAfter(
            t.objectProperty(
              t.identifier("modules"),
              t.arrayExpression(
                dynamicImports.map((dynamicImport) => {
                  return dynamicImport.sourceNode;
                }),
              ),
            ),
          );
        });
      },
    },
  };
}
