describe('office hours web lab structure', () => {
  it('matches the target heading and hero alt text', () => {
    const shell = document.querySelector('#app-shell');
    const preview = document.querySelector("[data-test='student-preview']");
    const heading = document.querySelector("[data-test='student-heading']");
    const image = document.querySelector("[data-test='student-image']");

    expect(shell).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(document.querySelectorAll("[data-test='student-heading']").length).toBe(1);
    expect(heading?.textContent?.trim()).toBe(shell?.dataset.targetHeading);
    expect(image?.getAttribute('alt')?.trim()).toBe(shell?.dataset.targetAlt);
  });
});
