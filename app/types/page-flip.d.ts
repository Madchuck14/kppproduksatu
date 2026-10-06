declare module 'page-flip' {
  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, number | string | boolean>)
    loadFromHTML(pages: HTMLElement[]): void
    on(event: string, callback: () => void): void
    getCurrentPageIndex(): number
    getOrientation(): 'portrait' | 'landscape'
    flipNext(): void
    flipPrev(): void
    update(): void
    destroy(): void
  }
}
