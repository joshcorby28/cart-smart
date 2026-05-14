// CartSmart App - Cart Drawer JS
// Config is injected by the Liquid block as window.CartSmartConfig

class CartDrawer extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;
    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    setTimeout(() => { this.classList.add('animate', 'active'); });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        if (typeof trapFocus === 'function') trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
    document.querySelectorAll('.smarte-sticky-atc').forEach((el) => (el.style.display = 'none'));
  }

  close() {
    this.classList.remove('active');
    if (typeof removeTrapFocus === 'function') removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
    document.querySelectorAll('.smarte-sticky-atc').forEach((el) => (el.style.display = ''));
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');
    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }
    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });
    if (typeof onKeyUpEscape === 'function') {
      cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
    }
  }

  renderContents(parsedState) {
    this.querySelector('.drawer__inner').classList.contains('is-empty') &&
      this.querySelector('.drawer__inner').classList.remove('is-empty');
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);
      sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
    });
    setTimeout(() => {
      this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      this.open();
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      { id: 'cart-drawer', selector: '#CartDrawer' },
      { id: 'cart-icon-bubble' },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends HTMLElement {
  getSectionsToRender() {
    return [
      { id: 'CartDrawer', section: 'cart-drawer', selector: '.drawer__inner' },
      { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);

// ─── CartDrawerFreeGift ───────────────────────────────────────────────────────

class CartDrawerFreeGift {
  constructor() {
    this.selectorContainer = null;
    this.selector = null;
    this.enableFreeGift = false;
    this.threshold = 0;
    this.currentGiftVariantId = null;
    this.isUpdating = false;
    this.init();
  }

  get config() {
    return window.CartSmartConfig || {};
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    const cartDrawer = document.querySelector('cart-drawer');
    if (!cartDrawer) return;

    this.enableFreeGift = cartDrawer.dataset.enableFreeGift === 'true';
    this.selector = document.querySelector('.free-gift-selector');
    this.selectorContainer = document.querySelector('.free-gift-products');

    // Read threshold from DOM data attributes (set in Liquid from metafields)
    const rewardsContainer = document.querySelector('.cart-drawer-rewards');
    if (rewardsContainer && rewardsContainer.dataset.freeGiftThreshold) {
      this.threshold = parseInt(rewardsContainer.dataset.freeGiftThreshold || 0);
    }
    if (!this.threshold && this.selector && this.selector.dataset.threshold) {
      this.threshold = parseInt(this.selector.dataset.threshold || 0);
    }
    if (!this.threshold) {
      const thresholdAttr = cartDrawer.dataset.freeGiftThreshold;
      if (thresholdAttr) this.threshold = parseInt(thresholdAttr);
    }

    if (!this.enableFreeGift) return;

    // Shopify pubsub
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      subscribe(PUB_SUB_EVENTS.cartUpdate, () => setTimeout(() => this.checkThreshold(), 100));
    }

    document.addEventListener('cart:updated', () => this.checkThreshold());

    document.addEventListener('shopify:section:load', (e) => {
      if (e.target.querySelector && e.target.querySelector('cart-drawer')) this.checkThreshold();
    });

    document.addEventListener('input', (e) => {
      if (e.target.matches('[name="updates[]"]')) {
        clearTimeout(this.quantityTimeout);
        this.quantityTimeout = setTimeout(() => this.checkThreshold(), 300);
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.matches('[name="updates[]"]')) {
        clearTimeout(this.quantityTimeout);
        this.quantityTimeout = setTimeout(() => this.checkThreshold(), 300);
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('cart-remove-button button, .cart-remove-button')) {
        setTimeout(() => this.checkThreshold(), 500);
        setTimeout(() => this.checkThreshold(), 1000);
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-upsell-add]')) {
        setTimeout(() => this.checkThreshold(), 500);
        setTimeout(() => this.checkThreshold(), 1000);
      }
    });

    const cartDrawerEl = document.querySelector('cart-drawer');
    if (cartDrawerEl) {
      const observer = new MutationObserver((mutations) => {
        const hasItemChange = mutations.some(
          (m) => m.target.closest && m.target.closest('.cart-items, .cart-item, cart-drawer-items')
        );
        if (hasItemChange) {
          clearTimeout(this.mutationTimeout);
          this.mutationTimeout = setTimeout(() => this.checkThreshold(), 200);
        }
      });
      observer.observe(cartDrawerEl, { childList: true, subtree: true });
    }

    const hookCartDrawer = () => {
      const el = document.querySelector('cart-drawer');
      if (!el) return;
      if (el.updateCart) {
        const orig = el.updateCart.bind(el);
        el.updateCart = async (...args) => {
          await orig(...args);
          setTimeout(() => this.checkThreshold(), 200);
        };
      }
    };
    hookCartDrawer();
    setTimeout(hookCartDrawer, 1000);
    setTimeout(hookCartDrawer, 3000);

    this.pollInterval = setInterval(() => {
      const drawer = document.querySelector('cart-drawer');
      if (drawer && !drawer.classList.contains('is-empty')) this.checkThreshold();
    }, 3000);

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = args[0]?.url || args[0];
      const isCartRequest =
        typeof url === 'string' &&
        (url.includes('/cart/add') ||
          url.includes('/cart/update') ||
          url.includes('/cart/change') ||
          url.includes('/cart/clear'));
      const result = await originalFetch.apply(window, args);
      if (isCartRequest) {
        setTimeout(() => this.checkThreshold(), 300);
        setTimeout(() => this.checkThreshold(), 800);
      }
      return result;
    };

    this.checkThreshold();
  }

  showSelector() {
    this.selectorContainer = document.querySelector('.free-gift-products');
    this.selector = document.querySelector('.free-gift-selector');
    if (this.selector && this.selectorContainer) {
      this.selector.classList.add('is-open');
      this.selector.setAttribute('aria-expanded', 'true');
    }
  }

  hideSelector() {
    this.selector = document.querySelector('.free-gift-selector');
    this.selectorContainer = document.querySelector('.free-gift-products');
    if (this.selector) {
      this.selector.classList.remove('is-open');
      this.selector.setAttribute('aria-expanded', 'false');
    }
  }

  async selectGift(variantId, productHandle) {
    if (this.isUpdating) return;
    this.isUpdating = true;
    try {
      await this.removeExistingGift();
      const discountCode = this.config.discountCode || '';
      const addBody = {
        id: variantId,
        quantity: 1,
        properties: { '_free-gift': 'true', '_free_gift_reason': 'threshold_reward' },
      };
      if (discountCode) addBody.discount = discountCode;

      const addResponse = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addBody),
      });

      if (!addResponse.ok) {
        const err = await addResponse.json();
        throw new Error(err.description || 'Failed to add gift');
      }

      await this.updateCart();
    } catch (error) {
      console.error('[CartSmart] selectGift error:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  async removeExistingGift() {
    try {
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      const giftItem = cart.items.find(
        (item) => item.properties && item.properties['_free-gift'] === 'true'
      );
      if (giftItem) {
        await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: { [giftItem.variant_id]: 0 } }),
        });
      }
    } catch (error) {
      console.error('[CartSmart] removeExistingGift error:', error);
    }
  }

  async checkThreshold() {
    if (!this.enableFreeGift) return;
    if (this.isCheckingThreshold) return;
    this.isCheckingThreshold = true;

    this.selector = document.querySelector('.free-gift-selector');
    this.selectorContainer = document.querySelector('.free-gift-products');

    const rewardsContainer = document.querySelector('.cart-drawer-rewards');
    if (rewardsContainer && rewardsContainer.dataset.freeGiftThreshold) {
      const t = parseInt(rewardsContainer.dataset.freeGiftThreshold || 0);
      if (t) this.threshold = t;
    }

    if (!this.threshold) {
      this.isCheckingThreshold = false;
      return;
    }

    try {
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      const giftItem = cart.items.find(
        (item) => item.properties && item.properties['_free-gift'] === 'true'
      );
      const hasFreeGift = !!giftItem;

      let subtotalExcludingGift = 0;
      for (const item of cart.items) {
        if (item.properties && item.properties['_free-gift'] === 'true') continue;
        subtotalExcludingGift += item.final_line_price;
      }

      if (subtotalExcludingGift < this.threshold && hasFreeGift) {
        await this.removeExistingGift();
        await this.updateCart();
      }

      this.updateProgressBars(subtotalExcludingGift);
    } catch (error) {
      console.error('[CartSmart] checkThreshold error:', error);
    } finally {
      this.isCheckingThreshold = false;
    }
  }

  updateProgressBars(cartTotal) {
    const rewardsContainer = document.querySelector('.cart-drawer-rewards');
    if (!rewardsContainer) return;

    const freeShippingThreshold = parseInt(rewardsContainer.dataset.freeShippingThreshold || 0);
    const freeGiftThreshold = parseInt(rewardsContainer.dataset.freeGiftThreshold || 0);
    const maxThreshold = Math.max(freeShippingThreshold, freeGiftThreshold);

    const progressFill = rewardsContainer.querySelector('.tiered-progress-fill');
    if (progressFill && maxThreshold > 0) {
      progressFill.style.width = `${Math.min((cartTotal / maxThreshold) * 100, 100)}%`;
    }

    const deliveryIcon = rewardsContainer.querySelector('.delivery-milestone');
    const giftIcon = rewardsContainer.querySelector('.gift-milestone');

    if (deliveryIcon) deliveryIcon.classList.toggle('reached', cartTotal >= freeShippingThreshold);
    if (giftIcon) giftIcon.classList.toggle('reached', cartTotal >= freeGiftThreshold);
  }

  formatMoney(amount) {
    const currency = this.config.currency || 'GBP';
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
  }

  async updateCart() {
    try {
      const [drawerResponse, bubbleResponse] = await Promise.all([
        fetch('/cart?view=drawer'),
        fetch('/cart.js'),
      ]);

      const drawerHtml = await drawerResponse.text();
      const cartData = await bubbleResponse.json();

      const parser = new DOMParser();
      const newDrawer = parser.parseFromString(drawerHtml, 'text/html').querySelector('cart-drawer');
      const currentDrawer = document.querySelector('cart-drawer');

      if (currentDrawer && newDrawer) {
        currentDrawer.innerHTML = newDrawer.innerHTML;
        this.updateProgressBars(cartData.total_price);
        this.selectorContainer = document.querySelector('.free-gift-products');
        this.selector = document.querySelector('.free-gift-selector');

        const rewardsContainer = document.querySelector('.cart-drawer-rewards');
        if (rewardsContainer && rewardsContainer.dataset.freeGiftThreshold) {
          this.threshold = parseInt(rewardsContainer.dataset.freeGiftThreshold || 0);
        }
      }

      const cartBubble = document.querySelector('.cart-count-bubble');
      if (cartBubble) cartBubble.textContent = cartData.item_count;

      document.dispatchEvent(new CustomEvent('cart:updated'));
      setTimeout(() => this.checkThreshold(), 100);
    } catch (error) {
      console.error('[CartSmart] updateCart error:', error);
    }
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

window.CartDrawer = window.CartDrawer || {};
window.CartDrawer.freeGift = new CartDrawerFreeGift();

Object.defineProperty(window.CartDrawer, 'safeFreeGift', {
  get: function () {
    if (!window.CartDrawer.freeGift) window.CartDrawer.freeGift = new CartDrawerFreeGift();
    return window.CartDrawer.freeGift;
  },
  configurable: true,
});

// ─── Event delegation: free gift buttons ─────────────────────────────────────

document.addEventListener('click', function (e) {
  const trigger = e.target.closest('[data-free-gift-action]');
  if (!trigger) return;
  if (!trigger.closest('cart-drawer')) return;
  if (!window.CartDrawer || !window.CartDrawer.freeGift) return;

  const action = trigger.dataset.freeGiftAction;
  if (action === 'showSelector') {
    window.CartDrawer.freeGift.showSelector();
  } else if (action === 'hideSelector') {
    window.CartDrawer.freeGift.hideSelector();
  } else if (action === 'selectGift') {
    const variantId = trigger.dataset.variantIdValue || trigger.dataset.variantId;
    const productHandle = trigger.dataset.productHandleValue || trigger.dataset.productHandle || '';
    if (variantId) window.CartDrawer.freeGift.selectGift(variantId, productHandle);
  }
});

// ─── Event delegation: upsell carousel ───────────────────────────────────────

document.addEventListener('click', async function (e) {
  const nav = e.target.closest('.cart-drawer-upsell__nav');
  if (nav) {
    const upsell = nav.closest('[data-upsell]');
    const viewport = upsell && upsell.querySelector('.cart-drawer-upsell__viewport');
    if (!viewport) return;
    const dir = nav.classList.contains('cart-drawer-upsell__nav--next') ? 1 : -1;
    viewport.scrollBy({ left: dir * viewport.clientWidth, behavior: 'smooth' });
    return;
  }

  const addBtn = e.target.closest('[data-upsell-add]');
  if (!addBtn) return;
  const variantId = addBtn.dataset.variantId;
  if (!variantId) return;

  addBtn.disabled = true;
  try {
    await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: 1 }),
    });
    if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-upsell', variantId });
    } else {
      document.dispatchEvent(new CustomEvent('cart:updated'));
    }
  } catch (err) {
    console.error('[CartSmart] upsell add failed', err);
  } finally {
    addBtn.disabled = false;
  }
});
