import { animationFrameScheduler, combineLatest, interval, merge, Observable, of } from 'rxjs';
import {
  filter,
  map,
  mapTo,
  mergeMap,
  pluck,
  scan,
  share,
  switchMap,
  tap,
  throttleTime,
  timeInterval,
} from 'rxjs/operators';
import { handRecognizer, ModelParams } from './input';

const nullUntilChange2th = <A, B>() => scan<[A,B], [A, B, B]>(([_, __, last], [first, curr]) => [
  first,
  last === curr ? null : curr,
  curr,
], [null, null, null]);

const advance = <T extends {
  position: [number, number],
}>(vX, vY) => (elapsed: number) => ({ position: [x, y], ...rest }: T) : T => ({
  ...rest,
  position: [x + vX * elapsed / 1000, y - vY * elapsed / 1000],
} as T);

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
  id: string,
  position: [number, number],
  power: number,
};
type GameState = {
  fps: number,
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
  map(({ mode, center: [x] }): Spaceship => ({
    mode: mode === 'close' ? 'attack' : 'charge',
    center: [x * canvas.width / video.width, canvas.height - 40],
  })),
);
const advanceBullet = advance<Bullet>(0, 200);
const bulletInBound = ({ position: [_, y] }: Bullet) => y >= 0;
const gun$ = combineLatest([
  spaceship$,
  timer$,
]).pipe(
  pluck(0),
  filter(({ mode }) => mode === 'attack'),
  throttleTime(50),
  map(({ center: [x, y] }): Bullet => ({
    id: btoa(String(Date.now())),
    position: [x, y - 25],
    power: 1,
  })),
);
const bullets$ = combineLatest([
  timer$,
  gun$,
]).pipe(
  pluck(1),
);

const advanceAsteroid = advance<Asteroid>(0, -100);
const asteroidInBound = ({ position: [_, y] }: Asteroid) => y <= canvas.height;
const asteroidIsAlive = ({ power }: Asteroid) => power > 0;
const adjustLife = (bullets: Bullet[]) => (asteroid: Asteroid): Asteroid => ({
  ...asteroid,
  power: 0,
});
const asteroids$ = combineLatest([
  timer$,
  timer$.pipe(
    throttleTime(100),
    map((): Asteroid => ({
      id: btoa(String(Date.now())),
      position: [canvas.width * Math.random(), 0],
      power: 30 * Math.random() + 5,
    })),
  ),
]).pipe(
  pluck(1),
);
const clearCanvas = () => context.clearRect(0, 0, canvas.width, canvas.height);
const drawSpaceship = ({ spaceship }: GameState) => {
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
const drawBullet = ({ position: [x, y] }: Bullet) => {
  context.beginPath();
  context.arc(x, y, 2, 0, 2 * Math.PI);
  context.fillStyle = '#0000FF';
  context.fill();
};
const drawBullets = ({ bullets }: GameState) => bullets.forEach(drawBullet);

const drawAsteroid = ({ position: [x, y], power }: Asteroid) => {
  context.beginPath();
  context.arc(x, y, power, 0, 2 * Math.PI);
  context.fillStyle = '#F000FF';
  context.fill();
};
const drawAsteroids = ({ asteroids }: GameState) => asteroids.forEach(drawAsteroid);

const game$ = combineLatest([
  timer$,
  spaceship$,
  bullets$,
  asteroids$,
]).pipe(
  scan<[number, Spaceship, Bullet, Asteroid],
    [number, Spaceship, Bullet, Asteroid, Bullet, Asteroid]>(
      ([_, __, ___, ____, ...changes], [elapsed, spaceship, bullet, asteroid]) => [
        elapsed,
        spaceship,
        changes[0] === bullet ? null : bullet,
        changes[1] === asteroid ? null : asteroid,
        bullet,
        asteroid,
      ], [null, null, null, null, null, null]),
  scan((state: GameState, [elapsed, spaceship, bullet, asteroid]): GameState => {
    const bullets = [
      ...state.bullets.map(advanceBullet(elapsed)).filter(bulletInBound),
      ...(bullet ? [bullet] : []),
    ];
    const asteroids = [
      ...state.asteroids
        .map(advanceAsteroid(elapsed))
        .filter(asteroidInBound)
        .filter(asteroidIsAlive),
      ...(asteroid ? [asteroid] : []),
    ];
    return {
      spaceship,
      asteroids,
      bullets,
      fps: 1000 / elapsed,
    };
  }, {
    spaceship: null,
    asteroids: [],
    bullets: [],
    fps: 0,
  }),
  tap(clearCanvas),
  tap(drawAsteroids),
  tap(drawSpaceship),
  tap(drawBullets),
);

game$.subscribe();
