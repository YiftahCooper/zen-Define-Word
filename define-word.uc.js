// Define Word 0.1.0 — generated from src/entry.js; run node build.mjs.
// Local candidate; native Zen verification required.
(() => {
  // project:src/providers/http.mjs
  function failure(code) {
    return Object.assign(new Error(code), { code });
  }
  async function requestJson(url, { fetch, signal }) {
    try {
      const response = await fetch(url, { signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
      if (response.status === 404) return null;
      if (response.status === 429) throw failure("rate-limit");
      if (!response.ok || Number(response.headers.get("content-length")) > 1048576) throw failure("unavailable");
      const reader = response.body.getReader(), chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1048576) throw failure("unavailable");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {
        });
        reader.releaseLock();
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return JSON.parse(new TextDecoder().decode(buffer));
    } catch (error) {
      if (signal?.aborted) throw failure("cancelled");
      throw failure(error.code === "rate-limit" ? "rate-limit" : "unavailable");
    }
  }
  function safeUrl(value, hosts2) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password && hosts2.includes(u.hostname) ? u.href : null;
    } catch {
      return null;
    }
  }
  var text = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 4e3) : "";

  // project:src/providers/free-dictionary.mjs
  function parseFreeDictionary(data, query = "") {
    if (!Array.isArray(data)) return null;
    const senses = [];
    let sourceUrl, license;
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      sourceUrl ||= entry.sourceUrls?.map((u) => safeUrl(u, ["en.wiktionary.org", "dictionaryapi.dev"])).find(Boolean);
      license ||= entry.license;
      for (const meaning of entry.meanings || []) for (const item of meaning.definitions || []) if (text(item.definition)) senses.push({ partOfSpeech: text(meaning.partOfSpeech), text: text(item.definition), examples: item.example ? [text(item.example)] : [] });
    }
    if (!senses.length) return null;
    return { headword: text(data[0]?.word) || query, language: "en", senses: senses.slice(0, 20), sourceUrl: sourceUrl || "https://dictionaryapi.dev/", attribution: { label: "Free Dictionary API", url: "https://dictionaryapi.dev/", licenseLabel: text(license?.name), licenseUrl: safeUrl(license?.url, ["creativecommons.org"]) } };
  }
  var freeDictionary = { id: "free-en", label: "Free Dictionary API", language: "en", keyRequired: false, async lookup(options) {
    return parseFreeDictionary(await requestJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(options.query)}`, options), options.query);
  } };

  // project:src/providers/wiktionary.mjs
  var parts = /^(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|article|numeral|proper noun|participle|phrase|proverb|contraction|prefix|suffix|symbol|letter)(?:\s+\d+)?$/i;
  function plain(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll("script,style,link,sup,table,dl,ul,ol,.mw-editsection").forEach((n) => n.remove());
    return text(copy.textContent);
  }
  function parse(document2, query, language) {
    const senses = [];
    let active = false, part = "";
    for (const node of document2.querySelectorAll("h2,h3,h4,h5,ol")) {
      if (node.closest("table,nav")) continue;
      const heading = plain(node);
      if (node.localName === "h2") {
        active = language === "en" ? heading === "English" : new RegExp("\\p{Script=Hebrew}", "u").test(heading) && !/^(ראו גם|הערות|קישורים)/u.test(heading);
        part = "";
        continue;
      }
      if (/^h[345]$/.test(node.localName)) {
        if (language === "he") active = false;
        else part = parts.test(heading) ? heading : "";
        continue;
      }
      if (!active || language === "en" && !part || node.parentElement.closest("ol,li,dl,ul")) continue;
      for (const item of node.children) {
        if (item.localName !== "li") continue;
        const definition = plain(item);
        if (!definition) continue;
        const exampleNodes = language === "en" ? [...item.querySelectorAll(".e-example,.e-quotation")] : [...item.querySelectorAll(":scope > dl > dd > ul > li")];
        const fallback = exampleNodes.length ? exampleNodes : [...item.querySelectorAll(":scope > dl > dd")].filter((n) => !n.querySelector(".nyms"));
        const examples = fallback.slice(0, 3).map(plain).filter(Boolean);
        senses.push({ partOfSpeech: part, text: definition, examples });
      }
    }
    if (!senses.length) return null;
    const sourceUrl = `https://${language}.wiktionary.org/wiki/${encodeURIComponent(query)}`;
    return { headword: query, language, senses: senses.slice(0, 20), sourceUrl, attribution: { label: language === "he" ? "ויקימילון" : "Wiktionary", url: sourceUrl, licenseLabel: "CC BY-SA 4.0 · adapted excerpt", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" } };
  }
  function wiktionary(language) {
    return { id: `wiktionary-${language}`, label: language === "he" ? "ויקימילון" : "Wiktionary", language, keyRequired: false, async lookup(options) {
      const url = `https://${language}.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(options.query)}&prop=text&format=json&formatversion=2&redirects=1`;
      const data = await requestJson(url, options);
      if (!data || data.error?.code === "missingtitle") return null;
      if (data.error || typeof data.parse?.text !== "string") throw failure("unavailable");
      return parse(options.parseDocument(data.parse.text), data.parse.title || options.query, language);
    } };
  }

  // project:src/providers/merriam-webster.mjs
  function tokens(value) {
    return text(value).replace(/\{(?:d_link|a_link|i_link|sx)\|([^|}]+)[^}]*\}/g, "$1").replace(/\{bc\}/g, ": ").replace(/\{[^}]*\}/g, "").trim();
  }
  function parseMerriamWebster(data, query, providerId) {
    if (!Array.isArray(data)) return null;
    const senses = [];
    for (const entry of data) {
      let walk = function(value) {
        if (!Array.isArray(value)) return;
        if (value[0] === "sense" && value[1]?.dt) {
          const dt = value[1].dt;
          const definition = dt.filter((x) => x[0] === "text").map((x) => tokens(x[1])).join(" ");
          const examples = dt.filter((x) => x[0] === "vis").flatMap((x) => x[1].map((e) => tokens(e.t))).filter(Boolean).slice(0, 3);
          if (definition) collected.push({ partOfSpeech: text(entry.fl), text: definition, examples });
        } else value.forEach(walk);
      };
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.shortdef)) continue;
      const collected = [];
      for (const def of entry.def || []) walk(def.sseq);
      senses.push(...collected.length ? collected : entry.shortdef.filter((x) => text(x)).map((x) => ({ partOfSpeech: text(entry.fl), text: tokens(x), examples: [] })));
    }
    if (!senses.length) return null;
    const learners = providerId === "mw-learners", sourceUrl = `https://www.merriam-webster.com/${learners ? "learner/" : ""}dictionary/${encodeURIComponent(query)}`;
    return { headword: text(data[0]?.hwi?.hw).replace(/\*/g, "") || query, language: "en", senses: senses.slice(0, 20), sourceUrl, attribution: { label: learners ? "Merriam-Webster's Learner's Dictionary" : "Merriam-Webster's Collegiate® Dictionary", url: sourceUrl, brand: "merriam-webster" } };
  }
  function merriamWebster(kind) {
    const id = `mw-${kind}`;
    return { id, label: kind === "learners" ? "Merriam-Webster Learner's" : "Merriam-Webster Collegiate", language: "en", keyRequired: true, async lookup(options) {
      return parseMerriamWebster(await requestJson(`https://www.dictionaryapi.com/api/v3/references/${kind}/json/${encodeURIComponent(options.query)}?key=${encodeURIComponent(options.key)}`, options), options.query, id);
    } };
  }

  // project:src/providers/registry.mjs
  var providers = new Map([freeDictionary, wiktionary("en"), wiktionary("he"), merriamWebster("collegiate"), merriamWebster("learners")].map((p) => [p.id, p]));

  // project:src/lookup.mjs
  function createLookupService({ providers: providers2, credentials, fetch = globalThis.fetch, parseDocument, timers = globalThis }) {
    return { async lookup({ term, providerId, signal }) {
      if (term?.status) return term;
      const provider = providers2.get(providerId);
      if (!provider || !term?.language || provider.language !== term.language) return { status: "unsupported" };
      if (signal?.aborted) return { status: "cancelled" };
      const abort = new AbortController();
      let timedOut = false, finishAbort;
      const stopped = new Promise((resolve) => finishAbort = resolve);
      const stop = () => {
        abort.abort();
        finishAbort({ status: timedOut ? "timeout" : "cancelled" });
      };
      signal?.addEventListener("abort", stop, { once: true });
      const timer = timers.setTimeout(() => {
        timedOut = true;
        stop();
      }, 1e4);
      async function request() {
        let key;
        if (provider.keyRequired) {
          try {
            key = await credentials?.get(providerId);
          } catch {
            return { status: "credential-unavailable" };
          }
          if (!key) return { status: "missing-key" };
        }
        if (abort.signal.aborted) return { status: "cancelled" };
        const options = { query: term.query, signal: abort.signal, key, fetch, parseDocument };
        let definition = await provider.lookup(options), normalizedRetry = false;
        if (!definition && term.language === "he" && term.withoutNiqqud && !abort.signal.aborted) {
          normalizedRetry = true;
          definition = await provider.lookup({ ...options, query: term.withoutNiqqud });
        }
        return definition ? { status: "ok", definition, normalizedRetry } : { status: "no-result" };
      }
      try {
        return await Promise.race([request().catch((error) => ({ status: ["rate-limit", "cancelled"].includes(error.code) ? error.code : "unavailable" })), stopped]);
      } finally {
        timers.clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
      }
    } };
  }

  // project:src/normalize.mjs
  function normalizeTerm(rawText) {
    const original = typeof rawText === "string" ? rawText.trim() : "";
    if (!original) return { status: "empty" };
    if ([...original].length > 100) return { status: "too-long" };
    const query = original.normalize("NFC").replace(/^[\p{P}\p{Z}\s]+|[\p{P}\p{Z}\s]+$/gu, "");
    if (!query) return { status: "empty" };
    const letters = [...query].filter((c) => new RegExp("\\p{L}", "u").test(c));
    const language = letters.length && letters.every((c) => new RegExp("\\p{Script=Hebrew}", "u").test(c)) ? "he" : letters.length && letters.every((c) => new RegExp("\\p{Script=Latin}", "u").test(c)) ? "en" : null;
    const without = query.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, "");
    return { original, query, language, withoutNiqqud: language === "he" && without !== query ? without : null };
  }

  // project:src/popup.mjs
  var hosts = ["en.wiktionary.org", "he.wiktionary.org", "dictionaryapi.dev", "www.merriam-webster.com", "creativecommons.org"];
  var messages = { empty: "Select a word on the page first.", unsupported: "Choose English or Hebrew to look up this selection.", "too-long": "Select a word or short phrase (up to 100 characters).", loading: "Looking up…", "no-result": "No definition found in this dictionary. Try another dictionary.", "missing-key": "Add your dictionary API key in Settings.", "credential-unavailable": "Credential storage is unavailable or locked. Unlock it and try again.", "rate-limit": "This dictionary’s request limit has been reached.", timeout: "The dictionary took too long to respond. Try again.", unavailable: "The dictionary is currently unavailable. Try again or choose another." };
  function createPopup(window2, callbacks) {
    const { document: document2 } = window2;
    const el = (tag, value) => {
      const n = document2.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (value !== void 0) n.textContent = value;
      return n;
    };
    const panel = document2.createXULElement("panel");
    panel.id = "define-word-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Word definition");
    panel.setAttribute("orient", "vertical");
    const box = el("div");
    box.className = "dw-card";
    const bar = el("div");
    bar.className = "dw-bar";
    const title = el("strong", "Define"), closeButton = el("button", "Close");
    closeButton.type = "button";
    bar.append(title, closeButton);
    const choices = el("div");
    choices.className = "dw-choices";
    const langLabel = el("label", "Language"), language = el("select");
    language.setAttribute("aria-label", "Definition language");
    for (const [value, label] of [["", "Choose language"], ["en", "English"], ["he", "עברית"]]) {
      const o = el("option", label);
      o.value = value;
      language.append(o);
    }
    langLabel.append(language);
    const providerLabel = el("label", "Dictionary"), provider = el("select");
    provider.setAttribute("aria-label", "Dictionary");
    providerLabel.append(provider);
    choices.append(langLabel, providerLabel);
    const result = el("div");
    result.dataset.result = "";
    result.setAttribute("aria-live", "polite");
    const word = el("h2"), headword = el("p"), status = el("p"), senses = el("ol");
    headword.dataset.headword = "";
    result.append(word, headword, status, senses);
    const footer = el("div");
    footer.className = "dw-footer";
    const attribution = el("div"), source = el("button", "Open source"), settings = el("button", "Settings");
    source.type = settings.type = "button";
    source.dataset.source = "";
    source.hidden = true;
    footer.append(attribution, source, settings);
    box.append(bar, choices, result, footer);
    panel.append(box);
    (document2.getElementById("mainPopupSet") || document2.documentElement).append(panel);
    let active = false, origin, originBrowser, sourceUrl;
    function close({ restoreFocus = false } = {}) {
      if (!active) return;
      active = false;
      panel.hidePopup();
      if (restoreFocus && originBrowser === window2.gBrowser.selectedBrowser && origin?.isConnected) origin.focus();
    }
    function link(value, label) {
      const url = safeUrl(value, hosts);
      const a = el("button", label);
      a.type = "button";
      a.className = "dw-source-link";
      a.disabled = !url;
      if (url) a.addEventListener("click", () => window2.openTrustedLinkIn(url, "tab"));
      return a;
    }
    closeButton.addEventListener("click", () => callbacks.onClose({ restoreFocus: true }));
    settings.addEventListener("click", callbacks.onSettings);
    source.addEventListener("click", () => {
      if (sourceUrl) window2.openTrustedLinkIn(sourceUrl, "tab");
    });
    language.addEventListener("change", () => {
      if (language.value) callbacks.onLanguageChange(language.value);
    });
    provider.addEventListener("change", () => callbacks.onProviderChange(provider.value));
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        callbacks.onClose({ restoreFocus: true });
      }
    });
    panel.addEventListener("popuphidden", (event) => {
      if (event.target === panel && active) {
        active = false;
        callbacks.onClose({ restoreFocus: false });
      }
    });
    return {
      show() {
        if (active) return;
        origin = document2.activeElement;
        originBrowser = window2.gBrowser.selectedBrowser;
        active = true;
        panel.openPopup(originBrowser, "overlap", 16, 16, false, false);
        closeButton.focus();
      },
      render({ term, providerId, providers: providers2, outcome }) {
        language.value = term.language || "";
        provider.replaceChildren();
        for (const p of providers2) {
          const option = el("option", p.label + (p.keyRequired ? " · API key" : ""));
          option.value = p.id;
          provider.append(option);
        }
        provider.value = providerId;
        provider.disabled = !providers2.length;
        result.dir = term.language === "he" ? "rtl" : "ltr";
        result.lang = term.language || "en";
        word.textContent = term.original || "Define";
        headword.textContent = "";
        headword.hidden = true;
        senses.replaceChildren();
        attribution.replaceChildren();
        sourceUrl = null;
        source.hidden = true;
        status.textContent = messages[outcome.status] || "";
        status.dir = "ltr";
        status.lang = "en";
        if (outcome.status === "ok") {
          const d = outcome.definition;
          result.dir = d.language === "he" ? "rtl" : "ltr";
          result.lang = d.language;
          if (d.headword && d.headword !== term.original) {
            headword.hidden = false;
            headword.textContent = (d.language === "he" ? "ערך במילון: " : "Dictionary entry: ") + d.headword;
          }
          status.textContent = outcome.normalizedRetry ? "Result found without niqqud." : "";
          for (const sense of d.senses) {
            const li = el("li");
            if (sense.partOfSpeech) {
              const part = el("span", sense.partOfSpeech);
              part.className = "dw-part";
              li.append(part);
            }
            li.append(el("p", sense.text));
            for (const example of sense.examples || []) {
              const quote = el("blockquote", example);
              li.append(quote);
            }
            senses.append(li);
          }
          if (d.attribution.brand === "merriam-webster") {
            const logo = el("img");
            logo.src = "chrome://sine/content/define-word/assets/merriam-webster.png";
            logo.alt = "Merriam-Webster";
            logo.width = logo.height = 50;
            attribution.append(logo);
          }
          attribution.append(link(d.attribution.url, d.attribution.label));
          if (d.attribution.licenseLabel) attribution.append(link(d.attribution.licenseUrl, d.attribution.licenseLabel));
          sourceUrl = safeUrl(d.sourceUrl, hosts);
          source.hidden = !sourceUrl;
        }
      },
      close,
      destroy() {
        close();
        panel.remove();
      }
    };
  }

  // project:src/controller.mjs
  function createController(window2, deps) {
    const { document: document2 } = window2, menu = document2.getElementById("contentAreaContextMenu");
    const item = document2.createXULElement("menuitem");
    item.id = "define-word-menu";
    item.hidden = true;
    item.setAttribute("label", "Define");
    menu?.append(item);
    let generation = 0, pending, disposed2 = false, lastTerm, lastProvider, lastSelection, originBrowser;
    const available = (language) => [...deps.providers.values()].filter((p) => p.language === language);
    const current = () => originBrowser === window2.gBrowser.selectedBrowser && (!lastSelection || deps.selection.isCurrent(window2, lastSelection));
    function close({ restoreFocus = false } = {}) {
      generation++;
      pending?.abort();
      pending = null;
      popup.close({ restoreFocus: restoreFocus && current() });
    }
    const popup = (deps.createPopup || createPopup)(window2, {
      onClose: close,
      onProviderChange(id) {
        if (!lastTerm || !current()) {
          close();
          return;
        }
        deps.saveProvider?.(lastTerm.language, id);
        run(lastTerm, id);
      },
      onLanguageChange(language) {
        if (!lastTerm || !current()) {
          close();
          return;
        }
        lastTerm = { ...lastTerm, language };
        run(lastTerm, defaultProvider(language));
      },
      onSettings() {
        close();
        deps.openSettings?.();
      }
    });
    const defaultProvider = (language) => language === "he" ? deps.settings().hebrewProvider : deps.settings().englishProvider;
    async function run(term, providerId, token = ++generation) {
      if (disposed2 || !current()) {
        close();
        return;
      }
      pending?.abort();
      pending = new AbortController();
      lastTerm = term;
      lastProvider = providerId;
      const state = { term, providerId, providers: available(term.language) };
      popup.render({ ...state, outcome: { status: term.status || (!term.language ? "unsupported" : "loading") } });
      popup.show(null);
      if (term.status || !term.language) return;
      const outcome = await deps.lookup.lookup({ term, providerId, signal: pending.signal });
      if (disposed2 || token !== generation || outcome.status === "cancelled") return;
      if (!current()) {
        close();
        return;
      }
      popup.render({ ...state, outcome });
    }
    async function define(contextMenu) {
      if (disposed2) return;
      const token = ++generation;
      pending?.abort();
      originBrowser = window2.gBrowser.selectedBrowser;
      const selection = await deps.selection.capture(window2, contextMenu);
      if (disposed2 || token !== generation) return;
      lastSelection = selection;
      const term = normalizeTerm(selection?.rawText || "");
      await run(term, defaultProvider(term.language), token);
    }
    function showing() {
      const context = window2.gContextMenu;
      const value = context?.selectionInfo?.text || "";
      item.hidden = !value.trim() || !!context?.onPassword;
      item.setAttribute("label", `Define “${value.slice(0, 36)}${value.length > 36 ? "…" : ""}”`);
    }
    const command = () => {
      const context = window2.gContextMenu;
      if (context && !context.onPassword) void define({ frameBrowsingContext: context.frameBrowsingContext, selectionInfo: { text: context.selectionInfo?.text || "" }, onPassword: context.onPassword });
    };
    item.addEventListener("command", command);
    menu?.addEventListener("popupshowing", showing);
    const dismiss = () => close();
    const progress = { onLocationChange(browser) {
      if (browser === originBrowser) close();
    } };
    const tabClosed = (event) => {
      if (event.target.linkedBrowser === originBrowser) close();
    };
    window2.gBrowser.tabContainer.addEventListener("TabSelect", dismiss);
    window2.gBrowser.tabContainer.addEventListener("TabClose", tabClosed);
    window2.gBrowser.addTabsProgressListener(progress);
    return { define, close, credentialsChanged(id) {
      if (id === lastProvider) close();
    }, destroy() {
      if (disposed2) return;
      disposed2 = true;
      close();
      item.removeEventListener("command", command);
      item.remove();
      menu?.removeEventListener("popupshowing", showing);
      window2.gBrowser.tabContainer.removeEventListener("TabSelect", dismiss);
      window2.gBrowser.tabContainer.removeEventListener("TabClose", tabClosed);
      window2.gBrowser.removeTabsProgressListener(progress);
      popup.destroy();
      deps.selection.release();
    } };
  }

  // project:src/shortcut.mjs
  var DEFAULT_BINDING = { code: "KeyD", ctrl: true, alt: true, shift: false, meta: false };
  function validateBinding(value) {
    if (value === null) return null;
    if (!value || !/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(value.code) || !["ctrl", "alt", "shift", "meta"].every((k) => typeof value[k] === "boolean") || !(value.ctrl || value.alt || value.meta)) throw new Error("Use Ctrl, Alt, or Meta with a letter, number, or function key.");
    return { code: value.code, ctrl: value.ctrl, alt: value.alt, shift: value.shift, meta: value.meta };
  }
  function bindingLabel(binding) {
    return binding ? [binding.ctrl ? "Ctrl" : null, binding.alt ? "Alt" : null, binding.shift ? "Shift" : null, binding.meta ? "Meta" : null, binding.code.replace(/^Key|^Digit/, "")].filter(Boolean).join("+") : "Disabled";
  }
  function findConflict(window2, binding) {
    if (!binding) return "";
    const isMac = /Mac/.test(window2.navigator.platform);
    for (const key of window2.document.querySelectorAll("key")) {
      if (key.getAttribute("disabled") === "true") continue;
      const name = key.getAttribute("key")?.toUpperCase(), code = key.getAttribute("keycode")?.replace(/^VK_/, "");
      const actual = binding.code.replace(/^Key|^Digit/, "");
      if (name !== actual && code !== actual) continue;
      const mods = new Set((key.getAttribute("modifiers") || "").split(/[ ,]+/));
      const flags = { ctrl: mods.has("control") || !isMac && mods.has("accel"), meta: mods.has("meta") || isMac && mods.has("accel"), alt: mods.has("alt"), shift: mods.has("shift") };
      if (["ctrl", "meta", "alt", "shift"].every((k) => flags[k] === binding[k])) return `Shortcut is already used by ${key.id || "a browser command"}. Choose another.`;
    }
    return "";
  }
  function createShortcut(window2, { binding, onInvoke, onConflict }) {
    let active = null, disposed2 = false;
    function update(value) {
      active = null;
      if (disposed2) return;
      try {
        const validated = validateBinding(value);
        const conflict2 = findConflict(window2, validated);
        onConflict(conflict2);
        if (!conflict2) active = validated;
      } catch (error) {
        onConflict(error.message);
      }
    }
    function keydown(event) {
      if (!active || event.defaultPrevented || event.repeat || event.isComposing || event.getModifierState?.("AltGraph")) return;
      if (event.code !== active.code || event.ctrlKey !== active.ctrl || event.altKey !== active.alt || event.shiftKey !== active.shift || event.metaKey !== active.meta) return;
      const conflict2 = findConflict(window2, active);
      if (conflict2) {
        active = null;
        onConflict(conflict2);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onInvoke();
    }
    window2.addEventListener("keydown", keydown);
    update(binding);
    return { update, destroy() {
      disposed2 = true;
      active = null;
      window2.removeEventListener("keydown", keydown);
    } };
  }

  // project:src/settings.mjs
  var PREF = "extension.define-word.";
  function readSettings(prefs) {
    const english = prefs.getStringPref(`${PREF}english`, "wiktionary-en"), hebrew = prefs.getStringPref(`${PREF}hebrew`, "wiktionary-he");
    let shortcut2;
    try {
      const raw = prefs.getStringPref(`${PREF}shortcut`, JSON.stringify(DEFAULT_BINDING));
      shortcut2 = raw.trim() ? validateBinding(JSON.parse(raw)) : null;
    } catch {
      shortcut2 = null;
    }
    return { englishProvider: providers.get(english)?.language === "en" ? english : "wiktionary-en", hebrewProvider: providers.get(hebrew)?.language === "he" ? hebrew : "wiktionary-he", shortcut: shortcut2 };
  }
  function saveSettings(prefs, settings) {
    if (providers.get(settings.englishProvider)?.language !== "en" || providers.get(settings.hebrewProvider)?.language !== "he") throw new Error("Choose a dictionary for the selected language.");
    const binding = validateBinding(settings.shortcut);
    prefs.setStringPref(`${PREF}english`, settings.englishProvider);
    prefs.setStringPref(`${PREF}hebrew`, settings.hebrewProvider);
    prefs.setStringPref(`${PREF}shortcut`, JSON.stringify(binding));
  }
  function openSettings(window2, { prefs, credentials, onCredentialsChanged, conflict: conflict2 }) {
    const { document: document2 } = window2;
    const existing = document2.getElementById("define-word-settings");
    if (existing) {
      existing.focus();
      return existing;
    }
    const origin = document2.activeElement, el = (tag, value) => {
      const n = document2.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (value !== void 0) n.textContent = value;
      return n;
    };
    const dialog2 = el("dialog");
    dialog2.id = "define-word-settings";
    dialog2.setAttribute("aria-labelledby", "define-word-settings-heading");
    const heading = el("h2", "Define settings");
    heading.id = "define-word-settings-heading";
    dialog2.append(heading);
    const current = readSettings(prefs), pickers = {};
    let binding = current.shortcut;
    for (const [lang, label, prop] of [["en", "English dictionary", "englishProvider"], ["he", "Hebrew dictionary", "hebrewProvider"]]) {
      const row = el("label", label), select = el("select");
      for (const p of providers.values()) if (p.language === lang) {
        const option = el("option", p.label + (p.keyRequired ? " · API key required" : ""));
        option.value = p.id;
        select.append(option);
      }
      select.value = current[prop];
      pickers[prop] = select;
      row.append(select);
      dialog2.append(row);
    }
    const error = el("p", conflict2?.() || "");
    error.setAttribute("role", "alert");
    const shortcutLabel = el("label", "Keyboard shortcut"), field = el("input");
    field.readOnly = true;
    field.value = bindingLabel(binding);
    shortcutLabel.append(field);
    dialog2.append(shortcutLabel);
    const actions = el("div");
    actions.className = "dw-actions";
    const record = el("button", "Record shortcut"), disable = el("button", "Disable shortcut");
    record.type = disable.type = "button";
    actions.append(record, disable);
    dialog2.append(actions);
    let recording = false;
    record.addEventListener("click", () => {
      recording = true;
      field.value = "Press a shortcut…";
      field.focus();
    });
    field.addEventListener("keydown", (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        recording = false;
        field.value = bindingLabel(binding);
        return;
      }
      if (event.isComposing || event.getModifierState?.("AltGraph")) return;
      try {
        const next = validateBinding({ code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey });
        const problem = findConflict(window2, next);
        if (problem) throw new Error(problem);
        binding = next;
        recording = false;
        field.value = bindingLabel(binding);
        error.textContent = "";
      } catch (problem) {
        error.textContent = problem.message;
      }
    });
    disable.addEventListener("click", () => {
      binding = null;
      recording = false;
      field.value = "Disabled";
    });
    const save = el("button", "Save settings");
    save.type = "button";
    save.addEventListener("click", () => {
      try {
        if (recording) throw new Error("Finish recording the shortcut first.");
        const problem = findConflict(window2, binding);
        if (problem) throw new Error(problem);
        saveSettings(prefs, { englishProvider: pickers.englishProvider.value, hebrewProvider: pickers.hebrewProvider.value, shortcut: binding });
        error.textContent = "Settings saved.";
      } catch (problem) {
        error.textContent = problem.message;
      }
    });
    dialog2.append(save);
    dialog2.append(el("h3", "Optional Merriam-Webster keys"), el("p", "Keys are saved in Firefox credential storage. A separate key is needed for each dictionary."));
    for (const id of ["mw-collegiate", "mw-learners"]) {
      const row = el("label", providers.get(id).label), input = el("input");
      input.type = "password";
      input.autocomplete = "off";
      input.maxLength = 512;
      row.append(input);
      dialog2.append(row);
      const buttons = el("div");
      buttons.className = "dw-actions";
      const set = el("button", "Save key"), remove = el("button", "Remove key");
      set.type = remove.type = "button";
      buttons.append(set, remove);
      dialog2.append(buttons);
      async function change(action) {
        set.disabled = remove.disabled = true;
        try {
          await action();
          input.value = "";
          onCredentialsChanged?.(id);
          error.textContent = "Dictionary key updated.";
        } catch {
          error.textContent = "Could not update the key. Check the value and unlock Firefox credential storage, then try again.";
        } finally {
          set.disabled = remove.disabled = false;
        }
      }
      set.addEventListener("click", () => change(() => credentials.set(id, input.value)));
      remove.addEventListener("click", () => change(() => credentials.remove(id)));
    }
    const info = el("button", "Get a Merriam-Webster API key");
    info.type = "button";
    info.addEventListener("click", () => window2.openTrustedLinkIn("https://dictionaryapi.com/", "tab"));
    dialog2.append(info, error);
    const done = el("button", "Done");
    done.type = "button";
    done.addEventListener("click", () => dialog2.close());
    dialog2.append(done);
    dialog2.addEventListener("close", () => {
      dialog2.remove();
      if (origin?.isConnected) origin.focus();
    });
    document2.documentElement.append(dialog2);
    dialog2.showModal();
    return dialog2;
  }

  // project:src/credentials.sys.mjs
  var ORIGIN = "https://define-word.invalid";
  var allowed = /* @__PURE__ */ new Set(["mw-collegiate", "mw-learners"]);
  function createCredentials(manager, createLogin) {
    function check(provider) {
      if (!allowed.has(provider)) throw new Error("Unsupported credential provider");
      if (!manager.isLoggedIn) throw new Error("credential-unavailable");
    }
    function find(provider) {
      check(provider);
      return manager.findLogins(ORIGIN, null, `define-word:${provider}`);
    }
    return {
      async get(provider) {
        try {
          return find(provider)[0]?.password || null;
        } catch {
          throw new Error("credential-unavailable");
        }
      },
      async set(provider, key) {
        check(provider);
        if (typeof key !== "string" || !key.trim() || key.length > 512) throw new Error("Enter a valid API key.");
        try {
          const existing = find(provider);
          const login = createLogin({ origin: ORIGIN, formActionOrigin: null, httpRealm: `define-word:${provider}`, username: "api-key", password: key.trim(), usernameField: "", passwordField: "" });
          if (existing.length) manager.modifyLogin(existing[0], login);
          else await manager.addLoginAsync(login);
        } catch {
          throw new Error("credential-unavailable");
        }
      },
      async remove(provider) {
        try {
          for (const login of find(provider)) manager.removeLogin(login);
        } catch {
          throw new Error("credential-unavailable");
        }
      }
    };
  }

  // project:src/entry.js
  window.__defineWord?.unload();
  var CREDENTIAL_TOPIC = "define-word-credentials-changed";
  var controller;
  var shortcut;
  var dialog;
  var observer;
  var credentialObserver;
  var disposed = false;
  var conflict = "";
  var owner = { unload() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("load", start);
    window.removeEventListener("unload", owner.unload);
    if (observer) Services.prefs.removeObserver(PREF, observer);
    if (credentialObserver) Services.obs.removeObserver(credentialObserver, CREDENTIAL_TOPIC);
    shortcut?.destroy();
    controller?.destroy();
    dialog?.remove();
    if (window.__defineWord === owner) delete window.__defineWord;
  } };
  window.__defineWord = owner;
  window.addEventListener("unload", owner.unload, { once: true });
  window.addUnloadListener?.(owner.unload);
  function start() {
    if (disposed || controller) return;
    let selection;
    try {
      const { acquireSelectionService } = ChromeUtils.importESModule("chrome://sine/content/define-word/src/selection.sys.mjs");
      selection = acquireSelectionService();
      const credentials = createCredentials(Services.logins, (fields) => {
        const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        login.init(fields.origin, fields.formActionOrigin, fields.httpRealm, fields.username, fields.password, fields.usernameField, fields.passwordField);
        return login;
      });
      const lookup = createLookupService({
        providers,
        credentials,
        fetch: window.fetch.bind(window),
        timers: window,
        parseDocument: (html) => new window.DOMParser().parseFromString(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'">` + html, "text/html")
      });
      controller = createController(window, {
        providers,
        selection,
        lookup,
        settings: () => readSettings(Services.prefs),
        saveProvider(language, id) {
          const settings = readSettings(Services.prefs);
          saveSettings(Services.prefs, { ...settings, [language === "he" ? "hebrewProvider" : "englishProvider"]: id });
        },
        openSettings() {
          dialog = openSettings(window, { prefs: Services.prefs, credentials, conflict: () => conflict, onCredentialsChanged: (id) => Services.obs.notifyObservers(null, CREDENTIAL_TOPIC, id) });
        }
      });
      shortcut = createShortcut(window, { binding: readSettings(Services.prefs).shortcut, onInvoke: () => {
        void controller.define();
      }, onConflict: (message) => {
        conflict = message;
      } });
      observer = { observe() {
        controller.close();
        shortcut.update(readSettings(Services.prefs).shortcut);
      } };
      Services.prefs.addObserver(PREF, observer);
      credentialObserver = { observe(_subject, _topic, id) {
        controller.credentialsChanged(id);
      } };
      Services.obs.addObserver(credentialObserver, CREDENTIAL_TOPIC);
    } catch {
      if (!controller) selection?.release();
      owner.unload();
      console.error("[Define Word] Could not initialize browser integration.");
    }
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
