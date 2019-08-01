import {animationFrameScheduler, combineLatest, interval, Observable, of} from 'rxjs';
import {filter, map, mergeMap, scan, share, tap, throttleTime, timeInterval} from 'rxjs/operators';
import {handRecognizer, ModelParams} from './input';
import {OperatorFunction} from "rxjs/src/internal/types";

const video = document.getElementById('camera') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d');

type SpaceshipMode = 'attack' | 'charge';
type Spaceship = {
  mode: SpaceshipMode,
  center: [number, number],
};
type Bullet = {
  id: string,
  position: [number, number];
  power: number,
};
type Asteroid = {
  id: number,
  position: [number, number],
  power: number,
};
type GameState = {
  fps: number,
  bulletV: number,
  shotRate: number,
  asteroids: Asteroid[],
  bullets: Bullet[],
  spaceship: Spaceship,
};

const modelParams: ModelParams = {
  flipHorizontal: true, // flip e.g for video
  maxNumBoxes: 20, // maximum number of boxes to detect
  iouThreshold: 0.5, // ioU threshold for non-max suppression
  scoreThreshold: 0.6, // confidence threshold for predictions.
};
const timer$ = interval(0, animationFrameScheduler)
  .pipe(
    timeInterval(),
    map(elapsed => elapsed.interval),
  );
const hands$ = handRecognizer(modelParams, canvas, context, video).pipe(share());
const spaceship$ = hands$.pipe(
  map(hands => hands[0]),
  filter(hand => !!hand),
  map(({mode, center: [x]}): Spaceship => ({
    mode: mode === 'close' ? 'attack' : 'charge',
    center: [x, canvas.height - 150],
  })),
);
const bulletV = 200;
const advanceBullet = (elapsed: number) => ({position: [x, y], ...rest}: Bullet): Bullet => ({
  position: [x, y - bulletV * elapsed / 1000],
  ...rest,
});
const bulletInBound = ({position: [_, y]}: Bullet) => y >= 0;
const bulletIdGenerator$: Observable<string> = spaceship$
  .pipe(
    filter(spaceship => spaceship.mode === 'attack'),
    throttleTime(50),
    map(Date.now),
    map(String),
  );
const bullets$ = combineLatest([
  timer$,
  spaceship$,
  bulletIdGenerator$,
]).pipe(
  scan((bullets: Bullet[], [elapsed, {center: [x, y], mode}, lastBulletId]): Bullet[] => {
    const advancedBullets = bullets.map(advanceBullet(elapsed)).filter(bulletInBound);
    if (mode === 'attack' && bullets.every(bullet => bullet.id !== lastBulletId)) {
      return [...advancedBullets, {
        id: lastBulletId,
        position: [x, y - 25],
        power: 1,
      }];
    }
    return advancedBullets;
  }, []),
);
const clearCanvas = () => context.clearRect(0, 0, canvas.width, canvas.height);
const drawSpaceship = ({spaceship}: GameState) => {
  const [x, y] = spaceship.center;
  const width = 50;
  const height = 50;
  context.beginPath();
  context.moveTo(x - width / 2, y + height / 2);
  context.lineTo(x + width / 2, y + height / 2);
  context.lineTo(x, y - height / 2);
  context.closePath();
  context.lineWidth = 2;
  context.strokeStyle = '#0000FF';
  context.stroke();
};
const drawBullet = ({position: [x, y]}: Bullet) => {
  context.beginPath();
  context.arc(x, y, 2, 0, 2 * Math.PI);
  context.fillStyle = '#0000FF';
  context.fill();
};
const drawBullets = ({bullets}: GameState) => bullets.forEach(drawBullet);

const mergeScan = <T, R>(
  accumulator: (acc: R, value: T, index: number) => Observable<R>,
  seed?: R,
) => scan<T, Observable<R>>((acc, value, index) => acc.pipe(
  mergeMap(observation => accumulator(observation, value, index)),
), of(seed));

const game$ = combineLatest([
  timer$,
  spaceship$,
  bullets$,
]).pipe(
  map(([time, spaceship, bullets]): Partial<GameState> => ({
    spaceship,
    asteroids: [],
    bullets,
    fps: 1000 / time,
  })),
  scan((current: GameState, partial): GameState => ({
    ...current,
    ...partial,
  }), {
    spaceship: null,
    asteroids: [],
    bullets: [],
    fps: 0,
    bulletV: 100,
    shotRate: 50,
  }),
  tap(clearCanvas),
  tap(drawSpaceship),
  tap(drawBullets),
);

game$.subscribe();
