describe('typescript ladder step 04', () => {
  it('marks step 04 solved', () => {
    const step = document.querySelector("[data-step-card='step-04']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
