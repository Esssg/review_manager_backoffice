// @ts-nocheck

const PRODUCT_LINK_LINE_PATTERN = /^https?:\/\//i;

function splitNonEmptyLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitProductDescriptionLinks(value) {
  return splitNonEmptyLines(value).reduce(
    (acc, line) => {
      if (PRODUCT_LINK_LINE_PATTERN.test(line)) {
        acc.productLinkLines.push(line);
      } else {
        acc.descriptionLines.push(line);
      }

      return acc;
    },
    {
      descriptionLines: [],
      productLinkLines: []
    }
  );
}

export function mergeProductLinkValues(...values) {
  const seen = new Set();
  const lines = [];

  values.forEach((value) => {
    splitNonEmptyLines(value).forEach((line) => {
      if (seen.has(line)) {
        return;
      }

      seen.add(line);
      lines.push(line);
    });
  });

  return lines.join("\n");
}

export function normalizeProductDescriptionAndLink(description, productLink) {
  const { descriptionLines, productLinkLines } = splitProductDescriptionLinks(description);

  return {
    description: descriptionLines.join("\n"),
    productLink: mergeProductLinkValues(productLink, productLinkLines.join("\n"))
  };
}
