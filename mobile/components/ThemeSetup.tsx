import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ComponentRef, ReactElement } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import type { NativeIconPack } from '../../lib/validation/native-icon-pack';
import { canonicalJson } from '../../lib/render/hash';
import type { ThemeDetailDTO } from '../lib/api';
import { fetchThemeIconPack } from '../lib/api';
import { formatNumber, localizedName } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n';
import { saveThemeIcons, shareThemeIcon } from '../lib/icon-media';
import { NativeMediaError, saveWallpaper, shareWallpaper } from '../lib/media';
import { PreferenceReadError } from '../lib/preferences';
import { createThemeSetupStore, setupIsComplete } from '../lib/theme-setup';
import type { ThemeSetupProgress } from '../lib/theme-setup';
import type { NativeSetupStep } from '../lib/navigation';
import { buildCalendarWidgetProps } from '../widgets/model';
import { CalendarPreview } from './Widgets';
import { Button, Copy, Feedback, Loading, Panel, styles, useUi } from './Ui';

interface Props {
  theme: ThemeDetailDTO;
  widgetThemeId: string | null;
  onApply: (theme: ThemeDetailDTO) => Promise<void>;
  onClose: () => void;
  onReload: () => void;
  initialStep?: NativeSetupStep;
}
type Step = NativeSetupStep;

export function ThemeSetup(props: Props): ReactElement {
  const { t } = useUi();
  const [pack, setPack] = useState<NativeIconPack | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchThemeIconPack(props.theme.slug, controller.signal),
      digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalJson(props.theme.spec)),
    ])
      .then(([value, hash]) => {
        if (
          value.themeId !== props.theme.id ||
          value.slug !== props.theme.slug ||
          value.specHash !== hash
        )
          throw new Error('Mismatched theme pack');
        if (!controller.signal.aborted) setPack(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [props.theme]);
  if (!pack)
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Button secondary label={t('backToTheme')} onPress={props.onClose} />
        {failed ? (
          <Feedback message={t('packUnavailable')} onRetry={props.onReload} />
        ) : (
          <Loading />
        )}
      </ScrollView>
    );
  return <SetupFlow key={`${pack.themeId}:${pack.specHash}`} {...props} pack={pack} />;
}

function SetupFlow({
  theme,
  pack,
  widgetThemeId,
  onApply,
  onClose,
  initialStep,
}: Props & { pack: NativeIconPack }): ReactElement {
  const { t, colors, locale, row } = useUi();
  const [store] = useState(() => createThemeSetupStore(AsyncStorage, pack));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { progress } = snapshot;
  const [step, setStep] = useState<Step>(initialStep ?? 'wallpaper');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(24);
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const running = useRef(false);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    active.current = true;
    void store.hydrate();
    return () => {
      active.current = false;
      operation.current?.abort();
    };
  }, [store]);
  const save = (change: (current: ThemeSetupProgress) => ThemeSetupProgress): void => {
    void store.update(change).catch(() => {
      if (active.current) setNotice('storageWarning');
    });
  };
  const run = async (
    name: string,
    action: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setBusy(name);
    setNotice(null);
    const controller = new AbortController();
    operation.current = controller;
    try {
      await action(controller.signal);
    } catch (error) {
      if (!active.current) return;
      if (controller.signal.aborted) setNotice('setupCancelled');
      else if (error instanceof PreferenceReadError) setNotice('readStorageWarning');
      else if (error instanceof NativeMediaError && error.code === 'PERMISSION_DENIED')
        setNotice('errorPermission');
      else setNotice(name === 'widget' ? 'errorWidget' : 'setupOperationFailed');
    } finally {
      running.current = false;
      if (operation.current === controller) operation.current = null;
      if (active.current) setBusy(null);
    }
  };
  const next = (value: Step): void => {
    setStep(value);
    setNotice(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const chosen = pack.icons.filter((icon) => progress.selected.includes(icon.appSlug));
  const current =
    chosen.find((icon) => icon.appSlug === focused) ??
    chosen.find((icon) => !progress.done.includes(icon.appSlug)) ??
    chosen[0];
  const pending = chosen.filter((icon) => !progress.saved.includes(icon.appSlug));
  const term = query.trim().normalize('NFC').toLocaleLowerCase();
  const filtered = pack.icons.filter((icon) =>
    [icon.name, icon.appSlug, ...icon.aliases].some((text) =>
      text.toLocaleLowerCase().includes(term),
    ),
  );
  const widget = buildCalendarWidgetProps(theme, locale);
  const selectedWidget = widgetThemeId === theme.id;
  const complete = setupIsComplete(progress, selectedWidget);
  const doneCount = chosen.filter((icon) => progress.done.includes(icon.appSlug)).length;
  const writeSavedIcon = async (appSlug: string): Promise<void> => {
    await store.update((value) => ({ ...value, saved: [...new Set([...value.saved, appSlug])] }));
    if (store.getSnapshot().issue === 'WRITE_FAILED')
      throw new Error('Setup progress was not persisted');
  };
  if (snapshot.loading) return <Loading />;
  if (snapshot.issue === 'READ_FAILED')
    return <Feedback message={t('readStorageWarning')} onRetry={() => void store.retry()} />;
  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={[styles.page, { gap: 12 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Button secondary label={t('backToTheme')} disabled={busy !== null} onPress={onClose} />
      <Copy heading>{t('setupTitle')}</Copy>
      <Copy>{localizedName(locale, theme)}</Copy>
      <Copy style={{ color: colors.secondary, fontSize: 13, lineHeight: 20 }}>
        {t('setupReality')}
      </Copy>
      <View style={{ flexDirection: row, gap: 8 }}>
        {(['wallpaper', 'icons', 'widget'] as const).map((value, index) => (
          <Button
            key={value}
            label={`${index + 1}. ${t(value === 'icons' ? 'iconsTitle' : value === 'widget' ? 'widgetsTab' : 'wallpaper')}`}
            secondary={step !== value}
            selected={step === value}
            disabled={busy !== null}
            style={{ flex: 1, paddingHorizontal: 6 }}
            onPress={() => next(value)}
          />
        ))}
      </View>
      {snapshot.issue ? (
        <Panel>
          <Copy accessibilityRole="alert">
            {t(snapshot.issue === 'INVALID_STORAGE' ? 'invalidStorage' : 'storageWarning')}
          </Copy>
          <Button secondary label={t('retryStorage')} onPress={() => void store.retry()} />
        </Panel>
      ) : null}
      {notice ? (
        <Copy accessibilityRole="alert" style={{ color: colors.secondary }}>
          {t(notice)}
        </Copy>
      ) : null}
      {busy && busy !== 'widget' ? (
        <Button secondary label={t('cancel')} onPress={() => operation.current?.abort()} />
      ) : null}
      {step === 'wallpaper' ? (
        <Panel>
          <Copy heading style={{ fontSize: 22 }}>
            {t('setupWallpaperTitle')}
          </Copy>
          <Copy>{t('wallpaperAssetDescription')}</Copy>
          <Image
            source={{ uri: theme.wallpapers.find((asset) => asset.size === 'phone')?.url }}
            accessibilityLabel={t('wallpaper')}
            resizeMode="contain"
            style={{
              width: '54%',
              aspectRatio: 1320 / 2868,
              alignSelf: 'center',
              borderRadius: 18,
              backgroundColor: colors.muted,
            }}
          />
          <Button
            label={t(progress.wallpaperSaved ? 'saveWallpaperAgain' : 'saveWallpaper')}
            disabled={busy !== null}
            busy={busy === 'wallpaper'}
            onPress={() =>
              void run('wallpaper', async (signal) => {
                await saveWallpaper(theme, signal);
                await store.update((value) => ({ ...value, wallpaperSaved: true }));
                if (active.current) setNotice('wallpaperSaved');
              })
            }
          />
          <Button
            secondary
            label={t('shareWallpaper')}
            disabled={busy !== null}
            busy={busy === 'wallpaperShare'}
            onPress={() => void run('wallpaperShare', (signal) => shareWallpaper(theme, signal))}
          />
          <Copy>{t('wallpaperSetInstructions')}</Copy>
          <Button
            secondary
            selected={progress.wallpaperSet}
            label={t(progress.wallpaperSet ? 'wallpaperConfirmed' : 'confirmWallpaper')}
            disabled={busy !== null}
            onPress={() =>
              save((value) => ({
                ...value,
                wallpaperSaved: true,
                wallpaperSet: !value.wallpaperSet,
              }))
            }
          />
          <Button
            label={t('continueIcons')}
            disabled={busy !== null}
            onPress={() => next('icons')}
          />
        </Panel>
      ) : step === 'icons' ? (
        <>
          <Panel>
            <Copy heading style={{ fontSize: 22 }}>
              {t('chooseApps')}
            </Copy>
            <Copy>{t('iconsExplanation')}</Copy>
            <TextInput
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setLimit(24);
              }}
              maxLength={80}
              accessibilityLabel={t('searchApps')}
              placeholder={t('searchApps')}
              placeholderTextColor={colors.secondary}
              editable={busy === null}
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 18,
                paddingHorizontal: 14,
                color: colors.ink,
                fontFamily: 'VibesetBody',
                textAlign: locale === 'ar' ? 'right' : 'left',
              }}
            />
            <View style={{ flexDirection: row, gap: 8 }}>
              <Button
                secondary
                label={t('selectAll')}
                disabled={busy !== null}
                style={{ flex: 1 }}
                onPress={() =>
                  save((value) => ({ ...value, selected: pack.icons.map((icon) => icon.appSlug) }))
                }
              />
              <Button
                secondary
                label={t('clearSelection')}
                disabled={busy !== null}
                style={{ flex: 1 }}
                onPress={() => save((value) => ({ ...value, selected: [] }))}
              />
            </View>
            <View style={{ flexDirection: row, flexWrap: 'wrap' }}>
              {filtered.slice(0, limit).map((icon) => {
                const checked = progress.selected.includes(icon.appSlug);
                return (
                  <Pressable
                    key={icon.appSlug}
                    accessibilityRole="checkbox"
                    accessibilityLabel={icon.name}
                    accessibilityState={{ checked, disabled: busy !== null }}
                    disabled={busy !== null}
                    onPress={() =>
                      save((value) => ({
                        ...value,
                        selected: checked
                          ? value.selected.filter((id) => id !== icon.appSlug)
                          : [...value.selected, icon.appSlug],
                      }))
                    }
                    style={{ width: '25%', padding: 5, gap: 4, alignItems: 'center' }}
                  >
                    <View
                      style={{
                        borderWidth: 2,
                        borderColor: checked ? colors.brand : 'transparent',
                        borderRadius: 17,
                        padding: 3,
                      }}
                    >
                      <Image
                        source={{ uri: icon.url }}
                        accessible={false}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 11,
                          backgroundColor: colors.muted,
                        }}
                      />
                    </View>
                    <Copy
                      numberOfLines={2}
                      style={{ fontSize: 10, lineHeight: 16, textAlign: 'center' }}
                    >
                      {checked ? '✓ ' : ''}
                      {icon.name}
                    </Copy>
                  </Pressable>
                );
              })}
            </View>
            {filtered.length === 0 ? <Copy>{t('noAppsFound')}</Copy> : null}
            {filtered.length > limit ? (
              <Button
                secondary
                label={t('loadMore')}
                onPress={() => setLimit((value) => value + 24)}
              />
            ) : null}
            <Copy accessibilityLiveRegion="polite">
              {t('selectedIcons')} · {formatNumber(locale, chosen.length)} — {t('savedIcons')} ·{' '}
              {formatNumber(locale, chosen.length - pending.length)}
            </Copy>
            <Button
              label={t(pending.length ? 'saveSelectedIcons' : 'iconsSaved')}
              disabled={busy !== null || pending.length === 0}
              busy={busy === 'icons'}
              onPress={() =>
                void run('icons', (signal) =>
                  saveThemeIcons(
                    pack,
                    pending.map((icon) => icon.appSlug),
                    writeSavedIcon,
                    signal,
                  ),
                )
              }
            />
            <Copy style={{ color: colors.secondary, fontSize: 13 }}>{t('iconSaveNote')}</Copy>
          </Panel>
          {current ? (
            <Panel>
              <Copy heading style={{ fontSize: 22 }}>
                {t('installOneIcon')}
              </Copy>
              <Copy>
                {formatNumber(locale, doneCount)} / {formatNumber(locale, chosen.length)} ·{' '}
                {t('iconsConfirmed')}
              </Copy>
              <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6 }}>
                {chosen.map((icon) => (
                  <Button
                    key={icon.appSlug}
                    secondary={current.appSlug !== icon.appSlug}
                    label={`${progress.done.includes(icon.appSlug) ? '✓ ' : ''}${icon.name}`}
                    disabled={busy !== null}
                    onPress={() => setFocused(icon.appSlug)}
                  />
                ))}
              </View>
              <Image
                source={{ uri: current.url }}
                accessibilityLabel={current.name}
                style={{ width: 96, height: 96, borderRadius: 22, alignSelf: 'center' }}
              />
              <Copy heading style={{ textAlign: 'center', fontSize: 24 }}>
                {current.name}
              </Copy>
              <Button
                label={t('saveThisIcon')}
                disabled={busy !== null}
                busy={busy === 'singleIcon'}
                onPress={() =>
                  void run('singleIcon', (signal) =>
                    saveThemeIcons(pack, [current.appSlug], writeSavedIcon, signal),
                  )
                }
              />
              <Button
                secondary
                label={t('shareThisIcon')}
                disabled={busy !== null}
                onPress={() =>
                  void run('shareIcon', (signal) => shareThemeIcon(pack, current.appSlug, signal))
                }
              />
              <Copy>{t('shortcutStep1')}</Copy>
              <Button
                label={t('openShortcuts')}
                disabled={busy !== null}
                onPress={() => {
                  void Linking.openURL('shortcuts://create-shortcut').catch(() =>
                    Alert.alert(t('openShortcutsManually')),
                  );
                }}
              />
              <Copy>
                {t('shortcutStep2')} {current.name}
              </Copy>
              <Copy>{t('shortcutStep3')}</Copy>
              <Copy>
                {t('shortcutStep4')} {current.name}
              </Copy>
              <Copy style={{ fontSize: 13, color: colors.secondary }}>{t('shortcutsLimit')}</Copy>
              <Button
                label={t(progress.done.includes(current.appSlug) ? 'iconConfirmed' : 'confirmIcon')}
                selected={progress.done.includes(current.appSlug)}
                disabled={busy !== null}
                onPress={() => {
                  const id = current.appSlug;
                  save((value) => ({
                    ...value,
                    saved: [...new Set([...value.saved, id])],
                    done: value.done.includes(id)
                      ? value.done.filter((item) => item !== id)
                      : [...value.done, id],
                  }));
                  setFocused(null);
                }}
              />
            </Panel>
          ) : (
            <Copy>{t('chooseAtLeastOne')}</Copy>
          )}
          <Button
            label={t('continueWidget')}
            disabled={busy !== null}
            onPress={() => next('widget')}
          />
        </>
      ) : (
        <Panel>
          <Copy heading style={{ fontSize: 22 }}>
            {t('setupWidgetTitle')}
          </Copy>
          <CalendarPreview
            selection={{
              id: theme.id,
              slug: theme.slug,
              nameEn: theme.nameEn,
              nameAr: theme.nameAr,
              surface: widget.surface,
              ink: widget.ink,
              accent: widget.accent,
              accentInk: widget.accentInk,
              appliedLocale: locale,
              creatorHandle: theme.creator?.handle ?? null,
            }}
          />
          <Copy style={{ fontSize: 13, color: colors.secondary }}>{t('previewOnly')}</Copy>
          <Button
            label={t('applyWidget')}
            disabled={busy !== null}
            busy={busy === 'widget'}
            onPress={() =>
              void run('widget', async () => {
                await onApply(theme);
                if (active.current) setNotice('widgetApplied');
              })
            }
          />
          <Copy>{t('setupWidgetInstructions')}</Copy>
          <Button
            secondary
            label={t(progress.widgetAdded && selectedWidget ? 'widgetConfirmed' : 'confirmWidget')}
            selected={progress.widgetAdded && selectedWidget}
            disabled={!selectedWidget || busy !== null}
            onPress={() => save((value) => ({ ...value, widgetAdded: !value.widgetAdded }))}
          />
          <Copy>{t('hideOriginalInstructions')}</Copy>
        </Panel>
      )}
      <Panel>
        <Copy heading style={{ fontSize: 22 }}>
          {t(complete ? 'setupCompleteTitle' : 'setupProgressTitle')}
        </Copy>
        <Copy>
          {progress.wallpaperSet ? '✓' : '○'} {t('wallpaper')} · {doneCount}/{chosen.length}{' '}
          {t('iconsTitle')} · {progress.widgetAdded && selectedWidget ? '✓' : '○'} {t('widgetsTab')}
        </Copy>
        <Copy style={{ color: colors.secondary, fontSize: 13 }}>{t('setupProgressNote')}</Copy>
      </Panel>
    </ScrollView>
  );
}
