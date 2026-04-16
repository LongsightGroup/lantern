describe('template authoring checks', () => {
  it('renders the starter title', () => {
    const title = document.querySelector("[data-test='app-title']");

    expect(title?.textContent?.trim()).toBe('Template App');
  });
});
