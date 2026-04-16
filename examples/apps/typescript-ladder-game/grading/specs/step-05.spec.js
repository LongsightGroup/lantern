describe('typescript ladder step 05', () => {
  it('marks step 05 solved', () => {
    const step = document.querySelector("[data-step-card='step-05']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
