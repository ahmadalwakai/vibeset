import { relations } from 'drizzle-orm';

import { account, session, user } from './schema/auth';
import { collections, collectionItems } from './schema/collections';
import { favorites, themeStatsDaily } from './schema/engagement';
import { creatorProfiles, reports } from './schema/moderation';
import { tags, themeTags } from './schema/taxonomy';
import { themes } from './schema/themes';

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  themes: many(themes, { relationName: 'themeOwner' }),
  favorites: many(favorites),
  creatorProfile: one(creatorProfiles),
}));

export const themesRelations = relations(themes, ({ one, many }) => ({
  owner: one(user, {
    fields: [themes.ownerId],
    references: [user.id],
    relationName: 'themeOwner',
  }),
  remixOf: one(themes, {
    fields: [themes.remixOfId],
    references: [themes.id],
    relationName: 'remix',
  }),
  remixes: many(themes, { relationName: 'remix' }),
  themeTags: many(themeTags),
  collectionItems: many(collectionItems),
  favorites: many(favorites),
  reports: many(reports),
  statsDaily: many(themeStatsDaily),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  themeTags: many(themeTags),
}));

export const themeTagsRelations = relations(themeTags, ({ one }) => ({
  theme: one(themes, {
    fields: [themeTags.themeId],
    references: [themes.id],
  }),
  tag: one(tags, {
    fields: [themeTags.tagId],
    references: [tags.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  items: many(collectionItems),
}));

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionItems.collectionId],
    references: [collections.id],
  }),
  theme: one(themes, {
    fields: [collectionItems.themeId],
    references: [themes.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  theme: one(themes, {
    fields: [favorites.themeId],
    references: [themes.id],
  }),
  user: one(user, {
    fields: [favorites.userId],
    references: [user.id],
  }),
}));

export const creatorProfilesRelations = relations(creatorProfiles, ({ one }) => ({
  user: one(user, {
    fields: [creatorProfiles.userId],
    references: [user.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  theme: one(themes, {
    fields: [reports.themeId],
    references: [themes.id],
  }),
}));

export const themeStatsDailyRelations = relations(themeStatsDaily, ({ one }) => ({
  theme: one(themes, {
    fields: [themeStatsDaily.themeId],
    references: [themes.id],
  }),
}));
