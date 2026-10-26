import path from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 비공개 리포 ubuntu-latest 러너는 2 vCPU 라 forks 풀 기본 워커 수(cpu-1)가 1 이 되어 전 스위트가
// 직렬 실행된다. CI 에서만 2로 올린다 — 로컬은 기본값(cpu-1) 유지.
const CI_MAX_WORKERS = 2;

export default defineConfig({
  resolve: {
    alias: {
      '@onyu/shared': path.resolve(__dirname, '../../libs/shared/src'),
      '@onyu/bot-api-client': path.resolve(__dirname, '../../libs/bot-api-client/src'),
      'src/': path.resolve(__dirname, 'src') + '/',
    },
  },
  test: {
    globals: true,
    maxWorkers: process.env.CI ? CI_MAX_WORKERS : undefined,
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    server: {
      deps: {
        external: [
          '@nestjs/common',
          '@nestjs/core',
          '@nestjs/config',
          '@nestjs/axios',
          '@nestjs/event-emitter',
          '@nestjs/platform-express',
          '@discord-nestjs/core',
          '@discord-nestjs/common',
          'discord.js',
          'rxjs',
          'reflect-metadata',
          'class-transformer',
          'class-validator',
        ],
      },
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
