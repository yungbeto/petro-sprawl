// The origin arcs with a direction (oil origins, M6 and M10): ArcLayer, plus soft pulses that run from each
// arc's source to its target. The shader already knows how far along its arc a pixel is (geometry.uv.x, 0 at
// the source, 1 at the target), so the pulses are a brightness ramp on that, moved by a clock; nothing is
// recomputed per frame. While `animate` is on the layer asks for the next frame after each draw; off (reduced
// motion), it is a plain ArcLayer.

import { ArcLayer, type ArcLayerProps } from '@deck.gl/layers';
import type { DefaultProps } from '@deck.gl/core';
import { ORIGIN_ARC } from '../lib/config';

type FlowProps = { animate: boolean };

const flowModule = {
  name: 'flow',
  fs: /* glsl */ `\
uniform flowUniforms {
  float time;
  float pulses;
  float tail;
  float boost;
} flow;
`,
  uniformTypes: { time: 'f32', pulses: 'f32', tail: 'f32', boost: 'f32' },
} as const;

// Pulses along the arc moving toward the target: bright at each head, fading over the tail behind it.
// Alpha is multiplied, not added, so the arc's antialiased edges stay soft.
const inject = {
  'fs:DECKGL_FILTER_COLOR': /* glsl */ `\
  if (flow.pulses > 0.0) {
    float phase = fract(geometry.uv.x * flow.pulses - flow.time);
    // Rises over the tail, then falls off over the last few percent, so the head is soft too.
    float glow = smoothstep(1.0 - flow.tail, 0.94, phase) * (1.0 - smoothstep(0.94, 1.0, phase));
    color.a = min(color.a * (1.0 + glow * (flow.boost - 1.0)), 1.0);
  }
`,
};

export class FlowArcLayer<D> extends ArcLayer<D, FlowProps> {
  static layerName = 'FlowArcLayer';
  static defaultProps = { ...ArcLayer.defaultProps, animate: true } as DefaultProps<ArcLayerProps<unknown> & FlowProps>;

  getShaders() {
    const shaders = super.getShaders();
    return { ...shaders, modules: [...shaders.modules, flowModule], inject: { ...shaders.inject, ...inject } };
  }

  draw(options: Parameters<ArcLayer<D>['draw']>[0]) {
    const { animate } = this.props;
    const { pulses, tail, boost, speed } = ORIGIN_ARC.flow;
    const time = animate ? (performance.now() / 1000) * speed * pulses : 0;
    this.state.model?.shaderInputs.setProps({ flow: { time, pulses: animate ? pulses : 0, tail, boost } });
    super.draw(options);
    if (animate) this.setNeedsRedraw();
  }
}

export type FlowArcLayerProps<D> = ArcLayerProps<D> & FlowProps;
