const fallbackCopyTextToClipboard = text => {
  const textArea = document.createElement("textarea");
  textArea.value = text;

  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    const msg = successful ? 'successful' : 'unsuccessful';
    console.log(`Fallback: Copying text command was ${ msg}`);
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err);
  }

  document.body.removeChild(textArea);
};

export const copyTextToClipboard = text => {
  if (!navigator.clipboard) {
    fallbackCopyTextToClipboard(text);
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    console.log('Async: Copying to clipboard was successful!');
    window.snackbar.createSnackbar(
        'Copied to clipboard!', { timeout: 3000 }
    );
  }, err => {
    console.error('Async: Could not copy text: ', err);
  });
};

export const getSpaceToViewportBottom = elementId => {
  // 1. Get the element by its ID
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Element not found');
    return null;
  }

  // 2. Get the element's position and dimensions relative to the viewport
  const rect = element.getBoundingClientRect();

  // 'rect.top' gives the distance from the top of the viewport to the top of the div
  const distanceToViewportTop = rect.top;

  // 3. Get the total height of the viewport
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  // Use document.documentElement.clientHeight as a fallback for older browsers

  // 4. Calculate the height between the top of the div and the bottom of the screen
  const heightToBottom = viewportHeight - distanceToViewportTop;

  return heightToBottom;
};

export const getSpaceToWindowBottom = elementId => {
  // 1. Get the element by its ID
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Element not found!");
    return null;
  }

  // 2. Get the element's position relative to the viewport
  const rect = element.getBoundingClientRect();
  const elementTopInViewport = rect.top; // Distance from the top of the viewport to the top of the element

  // 3. Get the current vertical scroll position of the window
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // 4. Calculate the element's distance from the top of the document
  const elementTopInDocument = elementTopInViewport + scrollTop;

  // 5. Get the total height of the document
  // This approach is widely compatible
  const documentHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
    document.body.clientHeight,
    document.documentElement.clientHeight
  );

  // 6. Calculate the final distance from the top of the div to the bottom of the page
  const distance = documentHeight - elementTopInDocument;

  return distance;
};

export const getSearchParam = (key, url = window.location.href) => {
  return new URL(url).searchParams.get(key);
};

export const setSearchParam = (key, value, { replace = true } = {}) => {
  const url = new URL(window.location.href);

  if (value === null || value === undefined) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }

  window.history[replace ? "replaceState" : "pushState"](
    {},
    "",
    url.toString()
  );
};
