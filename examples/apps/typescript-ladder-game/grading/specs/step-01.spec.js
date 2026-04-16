describe('typescript ladder step 01', () => {
  it('marks step 01 solved', () => {
    const step = document.querySelector("[data-step-card='step-01']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
