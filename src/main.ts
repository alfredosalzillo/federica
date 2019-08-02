import { animationFrameScheduler, combineLatest, interval, Observable, pipe } from 'rxjs';
import { filter, map, pluck, scan, share, tap, throttleTime, timeInterval } from 'rxjs/operators';
import { handRecognizer, ModelParams } from './input';

type Point = [number, number];
type WithPosition = {
  position: Point;
};
type SpaceshipMode = 'attack' | 'charge';
type Spaceship = {
  mode: SpaceshipMode,
  position: Point,
};
type Entity<T = any> = {
  id: string,
  type: T,
  position: Point;
  power: number,
};
type Bullet = Entity<'bullet'>;
type Asteroid = Entity<'asteroid'>;


const distance = ([x1, y1]: Point, [x2, y2]: Point): number => Math
  .sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));

type Collisions<T = any> = {
  [propName: string]: Array<Entity<T>>,
};

const collisionsBetween = <T1 extends WithPosition,
  T2 extends WithPosition,
  >(t1s: T1[], ts2: T2[]): Array<[T1, T2]> => t1s
  .map(t1 => ts2.filter(t2 => distance(t1.position, t2.position)).map(t2 => [t1, t2]))
  .reduce((acc, value) => [...acc, ...value]) as Array<[T1, T2]>;

const isEntity = <T extends Entity>(entityType: T['type']) => (value): value is T => value.type === entityType;
const isBullet = isEntity<Bullet>('bullet');
const isAsteroid = isEntity<Asteroid>('asteroid');

type GameState = {
  fps: number,
  asteroids: Asteroid[],
  bullets: Bullet[],
  spaceship: Spaceship,
  life: number,
};

const nullIfNotChanged = <T, K1 extends keyof T>(k1: K1) => pipe(
  scan<T, [T, T[K1]]>((acc, value) => {
    if (!acc) {
      return [value, value[k1]];
    }
    const [_, lastNonNullValue] = acc;
    const current = value[k1];
    return [current === lastNonNullValue ? Object.assign(value, { [k1]: null }) : value, current];
  }, null),
  pluck(0),
);

const advance = <T extends WithPosition>(vX, vY) => (elapsed: number) => ({
// @ts-ignore
  position: [x, y], ...rest}: T): T => ({
    ...rest,
    position: [x + vX * elapsed / 1000, y - vY * elapsed / 1000],
  });
const video = document.getElementById('camera') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d');
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
    position: [x * canvas.width / video.width, canvas.height - 40],
  })),
);
const bulletInBound = ({ position: [_, y] }: Bullet) => y >= 0;
const gun$: Observable<Bullet> = combineLatest([
  spaceship$,
  timer$,
]).pipe(
  pluck(0),
  filter(({ mode }) => mode === 'attack'),
  throttleTime(50),
  map(({ position: [x, y] }): Bullet => ({
    id: btoa(String(Date.now())),
    type: 'bullet',
    position: [x, y - 25],
    power: 1,
  })),
);
const bulletHitNothing = (asteroids: Asteroid[]) => (bullet: Bullet) => asteroids
  .every(asteroid => distance(asteroid.position, bullet.position) >= asteroid.power);

const bullets$ = combineLatest([
  timer$,
  gun$,
]).pipe(
  pluck(1),
);

const asteroidInBound = ({ position: [_, y] }: Asteroid) => y <= canvas.height;
const asteroidIsAlive = ({ power }: Asteroid) => power > 0;
const adjustLife = (bullets: Bullet[]) => (asteroid: Asteroid): Asteroid => ({
  ...asteroid,
  power: asteroid.power - bullets
    .filter(bullet => distance(bullet.position, asteroid.position) < asteroid.power)
    .reduce((acc, bullet) => acc + bullet.power, 0),
});

const asteroids$ = combineLatest([
  timer$,
  timer$.pipe(
    throttleTime(100),
    map((): Asteroid => ({
      id: btoa(String(Date.now())),
      type: 'asteroid',
      position: [canvas.width * Math.random(), 0],
      power: 30 * Math.random() + 5,
    })),
  ),
]).pipe(
  pluck(1),
);
const clearCanvas = () => context.clearRect(0, 0, canvas.width, canvas.height);
const drawSpaceship = ({ spaceship }: GameState) => {
  const [x, y] = spaceship.position;
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
const drawLife = ({ life }: GameState) => {
  const maxLife = 1000;
  context.fillStyle = '#FF0000';
  context.fillRect(canvas.width - 120, 20, 100, 10);
  context.fillStyle = '#0000FF';
  context.fillRect(canvas.width - 120, 20, life*100/maxLife, 10);
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

const initialState: GameState = {
  spaceship: null,
  asteroids: [],
  bullets: [],
  fps: 0,
  life: 1000,
};
const game$ = combineLatest([
  timer$,
  spaceship$,
  bullets$,
  asteroids$,
]).pipe(
  nullIfNotChanged(2),
  nullIfNotChanged(3),
  scan((state: GameState, [elapsed, spaceship, bullet, asteroid]): GameState => {
    const advanceBullet = advance<Bullet>(0, 200);
    const advanceAsteroid = advance<Asteroid>(0, -70);
    const asteroidsCollidingSpaceship = state.asteroids
      .filter(currAsteroid =>
        distance(spaceship.position, currAsteroid.position) < currAsteroid.power + 25);
    const notCollidingWithSpaceship = (curr: Asteroid) => asteroidsCollidingSpaceship
      .every(a => a.id !== curr.id);
    const bullets = [
      ...state.bullets
        .filter(bulletHitNothing(state.asteroids))
        .map(advanceBullet(elapsed))
        .filter(bulletInBound),
      ...(bullet ? [bullet] : []),
    ];
    const asteroids = [
      ...state.asteroids
        .filter(notCollidingWithSpaceship)
        .map(advanceAsteroid(elapsed))
        .filter(asteroidInBound)
        .map(adjustLife(bullets))
        .filter(asteroidIsAlive),
      ...(asteroid ? [asteroid] : []),
    ];
    return {
      spaceship,
      asteroids,
      bullets,
      fps: 1000 / elapsed,
      life: Math.max(0, state.life - asteroidsCollidingSpaceship
        .reduce((acc, collision) => acc + collision.power, 0)),
    };
  }, initialState),
  tap(clearCanvas),
  tap(drawAsteroids),
  tap(drawSpaceship),
  tap(drawBullets),
  tap(drawLife),
);

game$.subscribe();
