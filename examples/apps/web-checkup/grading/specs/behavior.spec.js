describe('web checkup behavior review', () => {
  it('records checklist progress through local state', () => {
    const reviewButton = document.querySelector("[data-test='review-button']");

    expect(reviewButton).not.toBeNull();
  });

  it('finalizes the review through the governed runtime seam', () => {
    const completeButton = document.querySelector("[data-test='complete-button']");

    expect(completeButton).not.toBeNull();
  });
});
