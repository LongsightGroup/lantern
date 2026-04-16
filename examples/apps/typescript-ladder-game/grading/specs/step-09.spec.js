describe('typescript ladder step 09', () => {
  it('marks step 09 solved', () => {
    const step = document.querySelector("[data-step-card='step-09']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
