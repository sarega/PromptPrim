import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const WORLD_MENTIONS_PLUGIN_KEY = new PluginKey('worldMentions');
const MAX_MATCHES_PER_TEXT_NODE = 96;
const MAX_SEARCH_ALIASES = 1200;

function normalizeTextValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const list = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const text = normalizeTextValue(value);
    if (!text) return;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(text);
  });
  return list;
}

function slugToken(value, fallback = 'other') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function buildSearchCandidates(rawSources = []) {
  const candidates = [];
  let aliasBudget = 0;

  (Array.isArray(rawSources) ? rawSources : []).forEach((rawSource, sourceIndex) => {
    const id = String(rawSource?.id || '').trim();
    const title = normalizeTextValue(rawSource?.title);
    if (!id || !title) return;

    const type = String(rawSource?.type || 'note').trim().toLowerCase() || 'note';
    const subtype = normalizeTextValue(rawSource?.subtype);
    const aliases = uniqueStrings([title, ...(Array.isArray(rawSource?.aliases) ? rawSource.aliases : [])]);

    aliases.forEach((alias, aliasIndex) => {
      if (aliasBudget >= MAX_SEARCH_ALIASES) return;
      aliasBudget += 1;
      candidates.push({
        id,
        alias,
        aliasLower: alias.toLocaleLowerCase(),
        title,
        type,
        subtype,
        aliasIndex,
        sourceIndex,
        isTitle: aliasIndex === 0,
        length: alias.length,
      });
    });
  });

  candidates.sort((left, right) => {
    const lengthDiff = (right?.length || 0) - (left?.length || 0);
    if (lengthDiff !== 0) return lengthDiff;
    const titlePriorityDiff = Number(Boolean(right?.isTitle)) - Number(Boolean(left?.isTitle));
    if (titlePriorityDiff !== 0) return titlePriorityDiff;
    const sourceDiff = (left?.sourceIndex || 0) - (right?.sourceIndex || 0);
    if (sourceDiff !== 0) return sourceDiff;
    return (left?.aliasIndex || 0) - (right?.aliasIndex || 0);
  });

  return candidates;
}

function isAsciiWordChar(char) {
  return /^[A-Za-z0-9_]$/.test(String(char || ''));
}

function aliasNeedsAsciiBoundary(alias = '') {
  return /[A-Za-z0-9_]/.test(String(alias || ''));
}

function hasSafeAsciiBoundary(text, start, end) {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  return !isAsciiWordChar(before) && !isAsciiWordChar(after);
}

function findMatchesInText(text = '', candidates = []) {
  const sourceText = String(text || '');
  if (!sourceText || !Array.isArray(candidates) || candidates.length === 0) return [];

  const lowerText = sourceText.toLocaleLowerCase();
  const allMatches = [];
  const seenRanges = new Set();

  for (const candidate of candidates) {
    const needle = candidate?.aliasLower;
    if (!needle || needle.length < 2) continue;
    let index = 0;
    while (index < lowerText.length) {
      const foundAt = lowerText.indexOf(needle, index);
      if (foundAt < 0) break;
      const end = foundAt + needle.length;
      if (aliasNeedsAsciiBoundary(candidate.alias) && !hasSafeAsciiBoundary(sourceText, foundAt, end)) {
        index = foundAt + 1;
        continue;
      }
      const dedupeKey = `${foundAt}:${end}:${candidate.id}`;
      if (!seenRanges.has(dedupeKey)) {
        seenRanges.add(dedupeKey);
        allMatches.push({
          from: foundAt,
          to: end,
          candidate,
        });
      }
      if (allMatches.length >= MAX_MATCHES_PER_TEXT_NODE) break;
      index = foundAt + Math.max(1, needle.length);
    }
    if (allMatches.length >= MAX_MATCHES_PER_TEXT_NODE) break;
  }

  if (allMatches.length === 0) return [];

  allMatches.sort((left, right) => {
    const startDiff = (left?.from || 0) - (right?.from || 0);
    if (startDiff !== 0) return startDiff;
    const lenDiff = ((right?.to || 0) - (right?.from || 0)) - ((left?.to || 0) - (left?.from || 0));
    if (lenDiff !== 0) return lenDiff;
    const titlePriorityDiff = Number(Boolean(right?.candidate?.isTitle)) - Number(Boolean(left?.candidate?.isTitle));
    if (titlePriorityDiff !== 0) return titlePriorityDiff;
    return (left?.candidate?.sourceIndex || 0) - (right?.candidate?.sourceIndex || 0);
  });

  const resolved = [];
  let cursor = -1;
  for (const match of allMatches) {
    if (!match || match.from < 0 || match.to <= match.from) continue;
    if (match.from < cursor) continue;
    resolved.push(match);
    cursor = match.to;
    if (resolved.length >= MAX_MATCHES_PER_TEXT_NODE) break;
  }

  return resolved;
}

function buildMentionClassName(candidate) {
  const typeSlug = slugToken(candidate?.type, 'note');
  const subtypeSlug = slugToken(candidate?.subtype, '');
  const classes = [
    'composer-world-mention',
    `composer-world-mention--type-${typeSlug}`,
  ];
  if (subtypeSlug) classes.push(`composer-world-mention--subtype-${subtypeSlug}`);
  return classes.join(' ');
}

function buildDecorationsForDocument(doc, candidates = []) {
  if (!doc || !Array.isArray(candidates) || candidates.length === 0) return DecorationSet.empty;

  const decorations = [];
  doc.descendants((node, pos) => {
    const nodeTypeName = String(node?.type?.name || '');
    if (!node?.isText) {
      if (nodeTypeName === 'instructionNode' || nodeTypeName === 'suggestionNode') return false;
      return true;
    }

    const text = String(node?.text || '');
    if (!text || text.trim().length < 2) return true;
    if (Array.isArray(node.marks) && node.marks.some((mark) => String(mark?.type?.name || '') === 'link')) return true;

    const matches = findMatchesInText(text, candidates);
    if (matches.length === 0) return true;

    matches.forEach((match) => {
      const candidate = match.candidate || {};
      const from = pos + match.from;
      const to = pos + match.to;
      decorations.push(Decoration.inline(from, to, {
        class: buildMentionClassName(candidate),
        'data-world-mention-id': String(candidate.id || ''),
        'data-world-mention-type': String(candidate.type || 'note'),
        'data-world-mention-subtype': String(candidate.subtype || ''),
        'data-world-mention-title': String(candidate.title || ''),
        'data-world-mention-match': String(candidate.alias || ''),
        title: String(candidate.title || candidate.alias || ''),
      }, {
        inclusiveStart: false,
        inclusiveEnd: false,
      }));
    });

    return true;
  });

  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

export function countWorldMentionMatchesByItemInText(text = '', sources = []) {
  const candidates = buildSearchCandidates(sources);
  if (!String(text || '').trim() || candidates.length === 0) {
    return {
      totalMentions: 0,
      uniqueItemCount: 0,
      countsByItemId: {},
    };
  }
  const matches = findMatchesInText(String(text || ''), candidates);
  const countsByItemId = {};
  matches.forEach((match) => {
    const id = String(match?.candidate?.id || '').trim();
    if (!id) return;
    countsByItemId[id] = (Number(countsByItemId[id]) || 0) + 1;
  });
  return {
    totalMentions: matches.length,
    uniqueItemCount: Object.keys(countsByItemId).length,
    countsByItemId,
  };
}

function normalizeSourceVersion(rawVersion, sources = []) {
  const explicit = normalizeTextValue(rawVersion);
  if (explicit) return explicit;
  if (!Array.isArray(sources) || sources.length === 0) return 'empty';
  return String(sources.length);
}

export const WorldMentions = Extension.create({
  name: 'worldMentions',

  addOptions() {
    return {
      onMentionClick: null,
    };
  },

  addCommands() {
    return {
      setWorldMentionSources:
        (payload = {}) =>
        ({ tr, dispatch }) => {
          const sources = Array.isArray(payload?.sources) ? payload.sources : [];
          const version = normalizeSourceVersion(payload?.version, sources);
          if (dispatch) {
            dispatch(tr.setMeta(WORLD_MENTIONS_PLUGIN_KEY, {
              action: 'setSources',
              sources,
              version,
            }));
          }
          return true;
        },
      clearWorldMentionSources:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(WORLD_MENTIONS_PLUGIN_KEY, {
              action: 'setSources',
              sources: [],
              version: 'empty',
            }));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin({
        key: WORLD_MENTIONS_PLUGIN_KEY,
        state: {
          init(_config, state) {
            return {
              version: 'empty',
              candidates: [],
              decorations: DecorationSet.empty,
              docSize: Number(state?.doc?.content?.size || 0),
            };
          },
          apply(tr, pluginState, _oldState, newState) {
            let nextVersion = pluginState?.version || 'empty';
            let nextCandidates = Array.isArray(pluginState?.candidates) ? pluginState.candidates : [];
            let shouldRebuild = Boolean(tr.docChanged);

            const meta = tr.getMeta(WORLD_MENTIONS_PLUGIN_KEY);
            if (meta && meta.action === 'setSources') {
              nextVersion = normalizeSourceVersion(meta.version, meta.sources);
              nextCandidates = buildSearchCandidates(meta.sources);
              shouldRebuild = true;
            }

            if (!shouldRebuild) {
              return pluginState;
            }

            return {
              version: nextVersion,
              candidates: nextCandidates,
              decorations: buildDecorationsForDocument(newState.doc, nextCandidates),
              docSize: Number(newState?.doc?.content?.size || 0),
            };
          },
        },
        props: {
          decorations(state) {
            return WORLD_MENTIONS_PLUGIN_KEY.getState(state)?.decorations || DecorationSet.empty;
          },
          handleClick(_view, _pos, event) {
            const target = event?.target;
            if (!(target instanceof Element)) return false;
            const mentionEl = target.closest('[data-world-mention-id]');
            if (!mentionEl) return false;

            const payload = {
              id: String(mentionEl.getAttribute('data-world-mention-id') || ''),
              type: String(mentionEl.getAttribute('data-world-mention-type') || 'note'),
              subtype: String(mentionEl.getAttribute('data-world-mention-subtype') || ''),
              title: String(mentionEl.getAttribute('data-world-mention-title') || ''),
              matchedText: String(mentionEl.getAttribute('data-world-mention-match') || mentionEl.textContent || ''),
            };
            if (!payload.id) return false;

            if (typeof extension.options.onMentionClick === 'function') {
              extension.options.onMentionClick(payload, event);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
