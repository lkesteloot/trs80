
export function showScreen(screen: HTMLElement): void {
    for (const s of document.querySelectorAll(".screen")) {
        s.classList.toggle("hidden", s !== screen);
    }
}
