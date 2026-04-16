describe('web checkup structure review', () => {
  it('uses one page heading and section checklists', () => {
    expect(document.querySelectorAll('h1').length).toBe(1);
    expect(document.querySelector("[data-test='html-checks']")).not.toBeNull();
    expect(document.querySelector("[data-test='css-checks']")).not.toBeNull();
  });

  it('keeps the primary review action visible', () => {
    expect(document.querySelector("[data-test='complete-button']")).not.toBeNull();
  });
});
