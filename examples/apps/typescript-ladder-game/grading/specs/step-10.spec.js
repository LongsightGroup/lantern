describe('typescript ladder step 10', () => {
  it('marks step 10 solved', () => {
    const step = document.querySelector("[data-step-card='step-10']");
    const shell = document.querySelector('#app-shell');

    expect(step).not.toBeNull();
    expect(step?.dataset.solved).toBe('true');
    expect(shell?.dataset.allSolved).toBe('true');
  });
});
