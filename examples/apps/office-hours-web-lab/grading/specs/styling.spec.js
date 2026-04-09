describe('office hours web lab styling', () => {
  it('matches the target theme and spacing tokens', () => {
    const shell = document.querySelector('#app-shell');
    const preview = document.querySelector("[data-test='student-preview']");

    expect(shell).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview?.dataset.theme).toBe(shell?.dataset.targetTheme);
    expect(preview?.dataset.spacing).toBe(shell?.dataset.targetSpacing);
  });
});
