export function attachPortraitSelection(html, {
  selector = ".portrait-option",
  selectedClass = "selected",
  dataKey = "target-id",
  onSelect = null
} = {}) {
  const portraits = html.find(selector);

  const selectPortrait = (element) => {
    portraits.removeClass(selectedClass).attr("aria-pressed", "false");
    const selected = $(element);
    selected.addClass(selectedClass);
    selected.attr("aria-pressed", "true");
    const selectedId = selected.data(dataKey);
    if (typeof onSelect === "function") {
      onSelect(selectedId, selected, portraits);
    }
  };

  portraits.attr("role", "button");
  portraits.attr("aria-pressed", "false");

  portraits.on("click", function () {
    selectPortrait(this);
  });

  portraits.on("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPortrait(this);
    }
  });

  return portraits;
}
