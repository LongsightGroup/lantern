describe('typescript ladder step 03', () => {
  it('marks step 03 solved', () => {
    const step = document.querySelector("[data-step-card='step-03']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
