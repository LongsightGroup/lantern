describe('typescript ladder step 06', () => {
  it('marks step 06 solved', () => {
    const step = document.querySelector("[data-step-card='step-06']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
