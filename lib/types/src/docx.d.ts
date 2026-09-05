/**
 * docx outline extraction: a .docx is a zip whose word/document.xml holds the
 * body text in <w:t> runs inside <w:p> paragraphs. We unzip with fflate and
 * walk the XML with a tiny tokenizer — no heavyweight XML/DOM dependency.
 */
/**
 * Extract plain text from a docx buffer: one line per <w:p> paragraph, with
 * <w:tab>/<w:br> preserved as whitespace. Tables and nested structures are
 * flattened in document order (their paragraphs are just <w:p> too).
 * @param buffer - the raw .docx bytes.
 * @returns the body text.
 */
export declare function extractDocxText(buffer: Uint8Array): string;
/**
 * Read and extract a docx outline from disk.
 * @param path - absolute path to the .docx file.
 * @returns the extracted outline text.
 */
export declare function readOutlineFromDocx(path: string): string;
