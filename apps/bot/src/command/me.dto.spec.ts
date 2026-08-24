/**
 * MeCommandDto `view` 옵션의 `@Choice` 로컬라이제이션 회귀 방지 테스트.
 *
 * `@discord-nestjs/core` 5.5.1 의 `Choice` 데코레이터는 축약형(`{ 표시명: value }`)을 쓰면
 * 표시명이 그대로 모든 locale 에 노출된다(한국어 choice key 를 쓰면 영어 클라이언트에도
 * "레벨"/"음성" 이 뜬다). 객체형(`{ value, nameLocalizations }`) 을 써야 기본 표시명(영어)과
 * `ko` 로컬라이즈가 분리된다.
 *
 * `CHOICE_DECORATOR` 문자열 상수는 `@discord-nestjs/core` 의 public entrypoint(`dist/index.d.ts`)에서
 * export 되지 않으므로(내부 전용) 직접 import 하지 않는다. 대신 라이브러리가 동일 용도로
 * public export 하는 `ReflectMetadataProvider#getChoiceDecoratorMetadata` (explorer 가 실제
 * 슬래시커맨드 choice 목록을 만들 때 호출하는 바로 그 메서드, `dist/explorers/option/option.explorer.js`
 * 참조) 를 통해 메타데이터를 읽는다.
 */
import 'reflect-metadata';

import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { describe, expect, it } from 'vitest';

import { MeCommandDto, MeViewOption } from './me.dto';

interface RawChoiceEntry {
  value: MeViewOption;
  nameLocalizations?: { ko?: string };
}

describe('MeCommandDto — view 옵션 @Choice 로컬라이제이션', () => {
  const metadataProvider = new ReflectMetadataProvider();

  it('choice 표시명(key)이 영어(Level/Voice)다', () => {
    const choices = metadataProvider.getChoiceDecoratorMetadata(MeCommandDto, 'view') as Record<
      string,
      RawChoiceEntry
    >;

    expect(Object.keys(choices)).toEqual(['Level', 'Voice']);
  });

  it('각 choice 에 ko nameLocalizations 가 레벨/음성으로 설정되어 있다', () => {
    const choices = metadataProvider.getChoiceDecoratorMetadata(MeCommandDto, 'view') as Record<
      string,
      RawChoiceEntry
    >;

    expect(choices['Level']?.nameLocalizations?.ko).toBe('레벨');
    expect(choices['Voice']?.nameLocalizations?.ko).toBe('음성');
  });

  it('각 choice 의 value 가 MeViewOption enum 값과 일치한다', () => {
    const choices = metadataProvider.getChoiceDecoratorMetadata(MeCommandDto, 'view') as Record<
      string,
      RawChoiceEntry
    >;

    expect(choices['Level']?.value).toBe(MeViewOption.Level);
    expect(choices['Voice']?.value).toBe(MeViewOption.Voice);
  });
});
