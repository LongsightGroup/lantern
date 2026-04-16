describe('typescript ladder step 08', () => {
  it('marks step 08 solved', () => {
    const step = document.querySelector("[data-step-card='step-08']");

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
  });
});
