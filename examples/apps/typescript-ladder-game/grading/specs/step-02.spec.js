describe('typescript ladder step 02', () => {
  it('marks step 02 solved', () => {
    const step = document.querySelector("[data-step-card='step-02']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
