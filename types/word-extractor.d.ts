declare module 'word-extractor' {
  class WordExtractor {
    extract(input: Buffer | string): Promise<{
      getBody(): string
      getFootnotes(): string
      getHeaders(): string
      getAnnotations(): string
    }>
  }
  export default WordExtractor
}
