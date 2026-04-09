describe('office hours web lab behavior', () => {
  it('matches the target button label', () => {
    const shell = document.querySelector('#app-shell');
    const button = document.querySelector("[data-test='student-preview-button']");

    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe(shell?.dataset.targetButtonLabel);
  });

  it('reveals the target confirmation message when the preview button is clicked', () => {
    const shell = document.querySelector('#app-shell');
    const button = document.querySelector("[data-test='student-preview-button']");
    const message = document.querySelector("[data-test='student-message']");
    const rehearsalCount = document.querySelector("[data-test='rehearsal-count']");
    const before = Number(rehearsalCount?.textContent?.trim() ?? '0');

    expect(button).not.toBeNull();
    button?.click();

    const after = Number(rehearsalCount?.textContent?.trim() ?? '0');

    expect(message?.hidden).toBe(false);
    expect(message?.textContent?.trim()).toBe(shell?.dataset.targetSuccessMessage);
    expect(after).toBe(before + 1);
  });
});
