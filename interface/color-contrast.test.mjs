import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarTextColor,contrastRatio} from './color-contrast.mjs';
import {typeColors,assessmentColors} from './map-layers.mjs';
test('yellow People avatars use dark initials',()=>{assert.equal(avatarTextColor(typeColors.person),'#171717');assert.ok(contrastRatio('#171717',typeColors.person)>=4.5);});
test('all map palettes and generated hues meet 4.5:1 for initials',()=>{for(const color of [...Object.values(typeColors),...Object.values(assessmentColors),...Array.from({length:360},(_,h)=>`hsl(${h} 58% 66%)`)])assert.ok(contrastRatio(avatarTextColor(color),color)>=4.5,color);});
test('dark backgrounds choose white; midtone fallback remains accessible',()=>{assert.equal(avatarTextColor('#171717'),'#ffffff');for(const color of ['#777777','#888888','#000000','#ffffff'])assert.ok(contrastRatio(avatarTextColor(color),color)>=4.5);assert.equal(contrastRatio('#000000','#ffffff'),21);});
