/**
 * Layer rules from ADR-0002: Types -> Config -> Repo -> Service -> Runtime -> UI.
 * Lower layers never import upper layers. UI never imports Config or Repo.
 * Each message says how to fix the violation.
 */
const layer = {
  types: "^src/types/",
  config: "^src/config/",
  repo: "^src/repo/",
  service: "^src/service/",
  runtime: "^src/(runtime/|proxy\.ts$)",
  providers: "^src/providers/",
  ui: "^src/(ui|app)/",
};

const forbid = (name, from, to, fix) => ({
  name,
  severity: "error",
  comment: fix,
  from: { path: from },
  to: { path: to },
});

module.exports = {
  forbidden: [
    forbid("types-is-bottom", layer.types,
      `${layer.config}|${layer.repo}|${layer.service}|${layer.runtime}|${layer.ui}|${layer.providers}`,
      "Types must not import other layers. Move the shared shape into src/types or pass it in."),
    forbid("config-only-types", layer.config,
      `${layer.repo}|${layer.service}|${layer.runtime}|${layer.ui}`,
      "Config may only import Types. Move logic that needs data access into Repo or Service."),
    forbid("repo-no-upper", layer.repo,
      `${layer.service}|${layer.runtime}|${layer.ui}`,
      "Repo must not import Service, Runtime or UI. Return data and let Service decide."),
    forbid("service-no-upper", layer.service,
      `${layer.runtime}|${layer.ui}`,
      "Service must not import Runtime or UI. Accept request data as arguments instead."),
    forbid("runtime-no-ui", layer.runtime, layer.ui,
      "Runtime must not import UI. Return data or state; let UI render it."),
    forbid("ui-no-config-repo", layer.ui, `${layer.config}|${layer.repo}`,
      "UI must not import Config or Repo. Call a Runtime server action or helper instead."),
    forbid("providers-no-upper", layer.providers,
      `${layer.repo}|${layer.service}|${layer.runtime}|${layer.ui}`,
      "Providers is cross-cutting and may only import Types and Config."),
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular import. Extract the shared part into a lower layer.",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "\.(test|spec)\.tsx?$" },
  },
};
