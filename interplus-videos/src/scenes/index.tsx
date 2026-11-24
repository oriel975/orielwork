import React from 'react';
import type {SceneType} from '../engine/schema';
import type {SceneProps} from './common';
import {OutroScene, ProjectsScene, StatScene} from './DataScenes';
import {BeforeAfterScene, ImageScene, LogoScene, MontageScene, TitleScene, VideoScene} from './MediaScenes';

export const SCENES: Record<SceneType, React.FC<SceneProps>> = {
  title: TitleScene,
  image: ImageScene,
  montage: MontageScene,
  projects: ProjectsScene,
  stat: StatScene,
  logo: LogoScene,
  outro: OutroScene,
  video: VideoScene,
  beforeAfter: BeforeAfterScene,
};

export type {SceneProps} from './common';
