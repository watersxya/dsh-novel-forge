/**
 * Browser-side docx outline extraction: a .docx is a zip whose
 * word/document.xml holds the body text in <w:t> runs inside <w:p> paragraphs.
 * Uses fflate (inlined into the client bundle) so the user can pick or drag a
 * docx without any server upload.
 *
 * Import from 'fflate/browser' (not 'fflate'): the default entry resolves to
 * the Node build (esm/index.mjs), which calls module.createRequire() for the
 * optional worker_threads path — inlining that into the browser bundle leaves
 * a bare require("module") the client-modules table cannot answer.
 */
/** Extract plain text from a docx buffer: one line per <w:p> paragraph. */
export declare function extractDocxTextFromBuffer(buffer: ArrayBuffer | Uint8Array): string;
/** Read a File as ArrayBuffer. */
export declare function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer>;
