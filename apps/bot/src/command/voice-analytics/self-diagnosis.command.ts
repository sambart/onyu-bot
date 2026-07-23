import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { SelfDiagnosisResultData } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { VERDICT_CATEGORY_CODE, VOICE_HEALTH_VERDICT_CATEGORY } from '@onyu/shared';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

const EMBED_COLOR = 0x5b8def;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

type Verdict = SelfDiagnosisResultData['verdicts'][number];
type BadgeGuide = SelfDiagnosisResultData['badgeGuides'][number];

@Command({
  name: 'self-diagnosis',
  nameLocalizations: { ko: '자가진단' },
  description: 'Diagnose your own voice activity',
  descriptionLocalizations: { ko: '내 음성 활동을 진단합니다' },
})
@Injectable()
export class SelfDiagnosisCommand {
  private readonly logger = new Logger(SelfDiagnosisCommand.name);

  private readonly UNIT_KEY: Record<string, string> = {
    MINUTES: 'voice.selfDiagnosisUnitMinutes',
    PERCENT: 'voice.selfDiagnosisUnitPercent',
    POINT: 'voice.selfDiagnosisUnitPoint',
    PERSON: 'voice.selfDiagnosisUnitPerson',
  };

  private readonly CRITERION_KEY: Record<string, string> = {
    VERDICT_CRIT_MIN_ACTIVITY_MINUTES: 'voice.selfDiagnosisCriterionMinActivity',
    VERDICT_CRIT_MIN_ACTIVE_DAYS_RATIO: 'voice.selfDiagnosisCriterionMinActiveDaysRatio',
    VERDICT_CRIT_MIN_DIVERSITY_POINTS: 'voice.selfDiagnosisCriterionMinDiversity',
    VERDICT_CRIT_MIN_PEER_COUNT: 'voice.selfDiagnosisCriterionMinPeer',
  };

  private readonly BADGE_NAME_KEY: Record<string, string> = {
    ACTIVITY: 'voice.selfDiagnosisBadgeNameActivity',
    SOCIAL: 'voice.selfDiagnosisBadgeNameSocial',
    HUNTER: 'voice.selfDiagnosisBadgeNameHunter',
    CONSISTENT: 'voice.selfDiagnosisBadgeNameConsistent',
    MIC: 'voice.selfDiagnosisBadgeNameMic',
  };

  private readonly BADGE_CRITERION_KEY: Record<string, string> = {
    BADGE_CRIT_ACTIVITY_TOP: 'voice.selfDiagnosisBadgeCriterionActivity',
    BADGE_CRIT_SOCIAL: 'voice.selfDiagnosisBadgeCriterionSocial',
    BADGE_CRIT_HUNTER_TOP: 'voice.selfDiagnosisBadgeCriterionHunter',
    BADGE_CRIT_CONSISTENT: 'voice.selfDiagnosisBadgeCriterionConsistent',
    BADGE_CRIT_MIC: 'voice.selfDiagnosisBadgeCriterionMic',
  };

  private readonly BADGE_CURRENT_KEY: Record<string, string> = {
    BADGE_CUR_ACTIVITY: 'voice.selfDiagnosisBadgeCurrentActivity',
    BADGE_CUR_SOCIAL: 'voice.selfDiagnosisBadgeCurrentSocial',
    BADGE_CUR_HUNTER_RANK: 'voice.selfDiagnosisBadgeCurrentHunterRank',
    BADGE_CUR_NO_RECORD: 'voice.selfDiagnosisBadgeCurrentNoRecord',
    BADGE_CUR_CONSISTENT: 'voice.selfDiagnosisBadgeCurrentConsistent',
    BADGE_CUR_MIC: 'voice.selfDiagnosisBadgeCurrentMic',
  };

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onSelfDiagnosis(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    if (!interaction.guildId) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.guildOnly'),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const response = await this.apiClient.runSelfDiagnosis(
        interaction.guildId,
        interaction.user.id,
      );

      if (!response.data) {
        if (response.reason === 'not_enabled') {
          await interaction.editReply({
            content: this.i18n.t(locale, 'voice.selfDiagnosisNotEnabled'),
          });
          return;
        }
        if (response.reason === 'cooldown') {
          const timeText = this.formatRemainingTime(response.remainingSeconds ?? 0);
          await interaction.editReply({
            content: this.i18n.t(locale, 'voice.selfDiagnosisCooldown', { time: timeText }),
          });
          return;
        }
        if (response.reason === 'quota_exhausted') {
          const quotaEmbed = new EmbedBuilder()
            .setTitle(this.i18n.t(locale, 'voice.selfDiagnosisQuotaTitle'))
            .setColor(0xffa500)
            .setDescription(this.i18n.t(locale, 'voice.selfDiagnosisQuotaDesc'));
          await interaction.editReply({ embeds: [quotaEmbed] });
          return;
        }
        await interaction.editReply({
          content: this.i18n.t(locale, 'voice.selfDiagnosisUnavailable'),
        });
        return;
      }

      const { result, analysisDays, isCooldownEnabled, cooldownHours } = response.data;

      if (result.totalMinutes === 0) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'voice.selfDiagnosisNoActivity', { days: analysisDays }),
        });
        return;
      }

      // LLM 요약을 먼저 시도하고, 실패 시 전체 섹션 fallback
      try {
        const llmResponse = await this.apiClient.getSelfDiagnosisLlmSummary(
          interaction.guildId,
          interaction.user.id,
        );
        if (llmResponse.data?.llmSummary) {
          result.llmSummary = llmResponse.data.llmSummary;
        }
      } catch (llmError) {
        this.logger.warn('LLM summary fetch failed, using data embed', llmError);
      }

      const embed = this.buildEmbed(result, analysisDays, isCooldownEnabled, cooldownHours, locale);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Self-diagnosis command error:', error);
      await interaction.editReply({ content: this.i18n.t(locale, 'voice.selfDiagnosisError') });
    }
  }

  private buildEmbed(
    result: SelfDiagnosisResultData,
    analysisDays: number,
    isCooldownEnabled: boolean,
    cooldownHours: number,
    locale: string,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(this.i18n.t(locale, 'voice.selfDiagnosisTitle'))
      .setColor(EMBED_COLOR);

    const sections: string[] = [];

    if (result.llmSummary) {
      sections.push(
        `${this.i18n.t(locale, 'voice.selfDiagnosisAiSummaryLabel')}\n${result.llmSummary}`,
      );
      sections.push(this.buildBadgeSection(result, locale));
    } else {
      sections.push(this.buildActivitySection(result, locale));
      sections.push(this.buildRelationshipSection(result, locale));
      sections.push(this.buildMocoSection(result, locale));
      sections.push(this.buildPatternSection(result, locale));
      sections.push(this.buildBadgeSection(result, locale));
    }

    embed.setDescription(sections.join('\n\n'));

    const nextAvailable = isCooldownEnabled
      ? this.formatNextAvailableTime(cooldownHours)
      : this.i18n.t(locale, 'voice.selfDiagnosisCooldownNone');
    embed.setFooter({
      text: this.i18n.t(locale, 'voice.selfDiagnosisFooter', {
        days: analysisDays,
        nextAvailable,
      }),
    });

    return embed;
  }

  /**
   * verdict 카테고리 판별. categoryCode(신규) 우선, 부재 시 한국어 category 문자열로 폴백(H-4.3, 구 API 호환).
   */
  private matchVerdict(v: Verdict, codeKey: keyof typeof VERDICT_CATEGORY_CODE): boolean {
    if (v.categoryCode) return v.categoryCode === VERDICT_CATEGORY_CODE[codeKey];
    return v.category === VOICE_HEALTH_VERDICT_CATEGORY[codeKey]; // 구 API 폴백
  }

  /** 구조값(actualValue/actualUnit)을 로케일 문구로 렌더. 구조값 부재 시 actual 원문 폴백. */
  private renderActual(locale: string, v: Verdict): string {
    if (v.actualValue != null && v.actualUnit && this.UNIT_KEY[v.actualUnit]) {
      return this.i18n.t(locale, this.UNIT_KEY[v.actualUnit], { value: v.actualValue });
    }
    return v.actual; // 폴백 (구 API)
  }

  /** 구조값(criterionCode/criterionParams)을 로케일 문구로 렌더. 구조값 부재/키 미존재 시 criterion 원문 폴백. */
  private renderCriterion(locale: string, v: Verdict): string {
    const key = v.criterionCode ? this.CRITERION_KEY[v.criterionCode] : undefined;
    if (key) {
      const t = this.i18n.t(locale, key, v.criterionParams);
      if (t !== key) return t;
    }
    return v.criterion; // 폴백
  }

  private buildActivitySection(result: SelfDiagnosisResultData, locale: string): string {
    const activityVerdict = result.verdicts.find((v) => this.matchVerdict(v, 'ACTIVITY'));
    const daysVerdict = result.verdicts.find((v) => this.matchVerdict(v, 'ACTIVE_DAYS'));

    const lines = [
      this.i18n.t(locale, 'voice.selfDiagnosisActivityHeader'),
      this.i18n.t(locale, 'voice.selfDiagnosisActivityLine', {
        totalTime: this.formatMinutes(result.totalMinutes),
        activeDays: result.activeDays,
        totalDays: result.totalDays,
        activeDaysRatio: this.formatPercent(result.activeDaysRatio),
      }),
      this.i18n.t(locale, 'voice.selfDiagnosisActivityLine2', {
        avgDaily: this.formatMinutes(result.avgDailyMinutes),
        rank: result.activityRank,
        total: result.activityTotalUsers,
        topPercent: result.activityTopPercent.toFixed(1),
      }),
    ];

    if (activityVerdict) {
      lines.push(
        `${this.verdictEmoji(activityVerdict.isPassed)} ${this.i18n.t(
          locale,
          'voice.selfDiagnosisVerdictFormat',
          {
            label: this.i18n.t(locale, 'voice.selfDiagnosisVerdictActivity'),
            actual: this.renderActual(locale, activityVerdict),
            criterion: this.renderCriterion(locale, activityVerdict),
          },
        )}`,
      );
    }
    if (daysVerdict) {
      lines.push(
        `${this.verdictEmoji(daysVerdict.isPassed)} ${this.i18n.t(
          locale,
          'voice.selfDiagnosisVerdictFormat',
          {
            label: this.i18n.t(locale, 'voice.selfDiagnosisVerdictDays'),
            actual: this.renderActual(locale, daysVerdict),
            criterion: this.renderCriterion(locale, daysVerdict),
          },
        )}`,
      );
    }

    return lines.join('\n');
  }

  private buildRelationshipSection(result: SelfDiagnosisResultData, locale: string): string {
    const hhiVerdict = result.verdicts.find((v) => this.matchVerdict(v, 'RELATIONSHIP_DIVERSITY'));
    const peerVerdict = result.verdicts.find((v) => this.matchVerdict(v, 'PEER_COUNT'));

    const diversityScore = Math.round((1 - result.hhiScore) * 100);
    const lines = [
      this.i18n.t(locale, 'voice.selfDiagnosisRelationHeader'),
      this.i18n.t(locale, 'voice.selfDiagnosisRelationLine', {
        peerCount: result.peerCount,
        diversityScore,
      }),
    ];

    if (result.topPeers.length > 0) {
      const peerList = result.topPeers
        .map(
          (p) => `${p.userName} (${this.formatMinutes(p.minutes)}, ${this.formatPercent(p.ratio)})`,
        )
        .join(', ');
      lines.push(this.i18n.t(locale, 'voice.selfDiagnosisRelationPeers', { peers: peerList }));
    }

    if (hhiVerdict) {
      lines.push(
        `${this.verdictEmoji(hhiVerdict.isPassed)} ${this.i18n.t(
          locale,
          'voice.selfDiagnosisVerdictFormat',
          {
            label: this.i18n.t(locale, 'voice.selfDiagnosisVerdictRelation'),
            actual: this.renderActual(locale, hhiVerdict),
            criterion: this.renderCriterion(locale, hhiVerdict),
          },
        )}`,
      );
    }
    if (peerVerdict) {
      lines.push(
        `${this.verdictEmoji(peerVerdict.isPassed)} ${this.i18n.t(
          locale,
          'voice.selfDiagnosisVerdictFormat',
          {
            label: this.i18n.t(locale, 'voice.selfDiagnosisVerdictPeer'),
            actual: this.renderActual(locale, peerVerdict),
            criterion: this.renderCriterion(locale, peerVerdict),
          },
        )}`,
      );
    }

    return lines.join('\n');
  }

  private buildMocoSection(result: SelfDiagnosisResultData, locale: string): string {
    if (result.mocoTotalUsers === 0) {
      return [
        this.i18n.t(locale, 'voice.selfDiagnosisMocoHeader'),
        this.i18n.t(locale, 'voice.selfDiagnosisMocoNoServer'),
      ].join('\n');
    }

    if (!result.hasMocoActivity) {
      return [
        this.i18n.t(locale, 'voice.selfDiagnosisMocoHeader'),
        this.i18n.t(locale, 'voice.selfDiagnosisMocoNoActivity'),
        this.i18n.t(locale, 'voice.selfDiagnosisMocoNoActivityHint'),
        this.i18n.t(locale, 'voice.selfDiagnosisMocoParticipants', {
          count: result.mocoTotalUsers,
        }),
      ].join('\n');
    }

    return [
      this.i18n.t(locale, 'voice.selfDiagnosisMocoHeader'),
      this.i18n.t(locale, 'voice.selfDiagnosisMocoScore', {
        score: result.mocoScore,
        rank: result.mocoRank,
        total: result.mocoTotalUsers,
        topPercent: result.mocoTopPercent.toFixed(1),
      }),
      this.i18n.t(locale, 'voice.selfDiagnosisMocoHelped', { count: result.mocoHelpedNewbies }),
    ].join('\n');
  }

  private buildPatternSection(result: SelfDiagnosisResultData, locale: string): string {
    return [
      this.i18n.t(locale, 'voice.selfDiagnosisPatternHeader'),
      this.i18n.t(locale, 'voice.selfDiagnosisPatternLine', {
        micUsage: this.formatPercent(result.micUsageRate),
        aloneRatio: this.formatPercent(result.aloneRatio),
      }),
    ].join('\n');
  }

  /** 뱃지 code → 로케일 name. code 미매핑/키 미존재 시 name 원문 폴백. */
  private badgeName(locale: string, b: BadgeGuide): string {
    const key = this.BADGE_NAME_KEY[b.code];
    if (key) {
      const t = this.i18n.t(locale, key);
      if (t !== key) return t;
    }
    return b.name; // 폴백
  }

  /** 뱃지 criterionCode → 로케일 criterion. 구조값 부재/키 미존재 시 criterion 원문 폴백. */
  private badgeCriterion(locale: string, b: BadgeGuide): string {
    const key = b.criterionCode ? this.BADGE_CRITERION_KEY[b.criterionCode] : undefined;
    if (key) {
      const t = this.i18n.t(locale, key, b.criterionParams);
      if (t !== key) return t;
    }
    return b.criterion; // 폴백
  }

  /** 뱃지 currentCode → 로케일 current. 구조값 부재/키 미존재 시 current 원문 폴백. */
  private badgeCurrent(locale: string, b: BadgeGuide): string {
    const key = b.currentCode ? this.BADGE_CURRENT_KEY[b.currentCode] : undefined;
    if (key) {
      const t = this.i18n.t(locale, key, b.currentParams);
      if (t !== key) return t;
    }
    return b.current; // 폴백
  }

  private buildBadgeSection(result: SelfDiagnosisResultData, locale: string): string {
    const earned = result.badgeGuides.filter((b) => b.isEarned);
    const unearned = result.badgeGuides.filter((b) => !b.isEarned);

    const lines: string[] = [];

    if (earned.length > 0) {
      const badgeText = earned.map((b) => `${b.icon} ${this.badgeName(locale, b)}`).join('  ');
      lines.push(`${this.i18n.t(locale, 'voice.selfDiagnosisBadgeEarned')}\n${badgeText}`);
    } else {
      lines.push(
        `${this.i18n.t(locale, 'voice.selfDiagnosisBadgeEarned')}\n${this.i18n.t(locale, 'voice.selfDiagnosisBadgeNone')}`,
      );
    }

    if (unearned.length > 0) {
      const guideLines = unearned.map(
        (b) =>
          `${b.icon} ${this.badgeName(locale, b)} — ${this.badgeCriterion(locale, b)} (${this.badgeCurrent(locale, b)})`,
      );
      lines.push(
        `${this.i18n.t(locale, 'voice.selfDiagnosisBadgeGuide')}\n${guideLines.join('\n')}`,
      );
    }

    return lines.join('\n\n');
  }

  private formatMinutes(minutes: number): string {
    const totalMin = Math.floor(minutes);
    const hours = Math.floor(totalMin / MINUTES_PER_HOUR);
    const mins = totalMin % MINUTES_PER_HOUR;

    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  private formatPercent(ratio: number): string {
    return `${(ratio * 100).toFixed(1)}%`;
  }

  private formatNextAvailableTime(cooldownHours: number): string {
    if (cooldownHours < HOURS_PER_DAY) {
      return `${cooldownHours}h`;
    }
    const days = Math.floor(cooldownHours / HOURS_PER_DAY);
    const hours = cooldownHours % HOURS_PER_DAY;
    if (days > 0 && hours > 0) {
      return `${days}d ${hours}h`;
    }
    if (days > 0) {
      return `${days}d`;
    }
    return `${hours}h`;
  }

  private formatRemainingTime(seconds: number): string {
    const totalMin = Math.ceil(seconds / SECONDS_PER_MINUTE);
    const hours = Math.floor(totalMin / MINUTES_PER_HOUR);
    const mins = totalMin % MINUTES_PER_HOUR;

    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  private verdictEmoji(isPassed: boolean): string {
    return isPassed ? '✅' : '⚠️';
  }
}
