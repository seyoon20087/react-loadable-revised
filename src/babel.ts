import type { PluginObject, NodePath } from "@babel/core";
import type * as babelTypes from "@babel/types";
import type {
  ImportDeclaration,
  Node,
  Expression,
  ImportExpression,
} from "@babel/types";

interface BabelPluginAPI {
  types: typeof babelTypes;
}

export default function ({ types: t }: BabelPluginAPI): PluginObject {
  return {
    visitor: {
      ImportDeclaration(path: NodePath<ImportDeclaration>) {
        const source = path.node.source.value;
        if (source !== "react-loadable") return;

        const defaultSpecifier = path.get("specifiers").find((specifier) => {
          return specifier.isImportDefaultSpecifier();
        });

        if (!defaultSpecifier) return;

        const bindingName = defaultSpecifier.node.local.name;
        const binding = path.scope.getBinding(bindingName);
        if (!binding) return;

        binding.referencePaths.forEach((refPath) => {
          let callExpression: NodePath<Node> | null = refPath.parentPath;
          if (!callExpression) return;

          if (
            callExpression.isMemberExpression() &&
            callExpression.node.computed === false &&
            (callExpression.get("property") as NodePath).isIdentifier({
              name: "Map",
            })
          ) {
            callExpression = callExpression.parentPath;
            if (!callExpression) return;
          }

          if (!callExpression.isCallExpression()) return;

          const args = callExpression.get("arguments");
          if (args.length !== 1) {
            // In modern Babel typings, buildCodeFrameError is the standard compilation error method
            throw callExpression.buildCodeFrameError(
              "react-loadable requires exactly one argument",
            );
          }

          const options = args[0];
          if (!options.isObjectExpression()) return;

          const properties = options.get("properties");
          const propertiesMap: Record<string, NodePath<any>> = {};

          properties.forEach((property) => {
            if (property.isObjectProperty() || property.isObjectMethod()) {
              const key = property.get("key");
              if (!Array.isArray(key) && key.isIdentifier()) {
                propertiesMap[key.node.name] = property;
              }
            }
          });

          if (propertiesMap.webpack) {
            return;
          }

          const loaderProperty = propertiesMap.loader;
          if (!loaderProperty) return;

          const loaderMethod = loaderProperty.get("value");
          if (Array.isArray(loaderMethod)) return;

          const dynamicImports: Array<{ sourceNode: babelTypes.Expression }> =
            [];

          // Create the visitor object dynamically
          const traverseVisitors: any = {
            Import(importPath: NodePath<babelTypes.Import>) {
              const callExpr = importPath.parentPath;
              if (callExpr && callExpr.isCallExpression()) {
                const callArgs = callExpr.get("arguments");
                const firstArg = Array.isArray(callArgs)
                  ? callArgs[0]
                  : callArgs;
                if (firstArg && !Array.isArray(firstArg)) {
                  dynamicImports.push({
                    sourceNode: firstArg.node as Expression,
                  });
                }
              }
            },
          };

          // Guard: Only register ImportExpression if the current
          // Babel version knows what an ImportExpression is.
          if (typeof t.isImportExpression === "function") {
            traverseVisitors.ImportExpression = function (
              importExprPath: NodePath<ImportExpression>,
            ) {
              dynamicImports.push({
                sourceNode: importExprPath.get("source").node,
              });
            };
          }

          loaderMethod.traverse(traverseVisitors);

          if (!dynamicImports.length) return;

          loaderProperty.insertAfter(
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

          loaderProperty.insertAfter(
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
