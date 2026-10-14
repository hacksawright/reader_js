/**
 * Phép tìm phần tử dùng chung trên DOM, không phụ thuộc trang nào.
 * Giữ nguyên logic của reader/dom.py.
 */

export async function firstVisible(page, selectors, limit = 5) {
  for (const selector of selectors) {
    const items = page.locator(selector);
    let count = 0;
    try {
      count = Math.min(await items.count(), limit);
    } catch {
      continue;
    }
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      try {
        if (await item.isVisible()) {
          return item;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function firstVisibleByRole(page, names, roles = ['button', 'link'], limit = 5) {
  for (const name of names) {
    for (const role of roles) {
      const isString = typeof name === 'string';
      const items = page.getByRole(role, { name, exact: isString });
      let count = 0;
      try {
        count = Math.min(await items.count(), limit);
      } catch {
        continue;
      }
      for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        try {
          if (await item.isVisible()) {
            return item;
          }
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}
