export type CatalogJobKind = "ingest" | "classify";

/** A catalog ingest or classification job the upload page can attach to. */
export type ActiveCatalogJob = {
  kind: CatalogJobKind;
  /** Basename under ./data, e.g. ingest-123.log. Empty while the log is still being created. */
  logFile: string;
  dir: string;
  /** Ingest product type, or classify "apply" / "dry-run". */
  type: string;
  startedAt: string;
  /** False for a recently finished run kept on screen after the lock is released. */
  running: boolean;
};
