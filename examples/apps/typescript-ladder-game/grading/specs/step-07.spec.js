describe('typescript ladder step 07', () => {
  it('marks step 07 solved', () => {
    const step = document.querySelector("[data-step-card='step-07']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
