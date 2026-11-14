import { camelize, snakeize } from './case';

describe('conversion de casse', () => {
  it('camelize convertit récursivement', () => {
    expect(camelize({ first_name: 'A', class_name: 'B', nested: [{ room_id: 1 }] })).toEqual({
      firstName: 'A', className: 'B', nested: [{ roomId: 1 }],
    });
  });
  it('snakeize convertit récursivement et laisse FormData/File intacts', () => {
    const fd = new FormData();
    expect(snakeize<{ fd: FormData }>({ firstName: 'A', nested: { roomId: 2 }, fd }).fd).toBe(fd);
    expect(snakeize({ firstName: 'A', nested: { roomId: 2 } })).toEqual({ first_name: 'A', nested: { room_id: 2 } });
  });
  it('ne touche pas aux valeurs (ex. codes en majuscules)', () => {
    expect(camelize({ status: 'EN_ATTENTE' })).toEqual({ status: 'EN_ATTENTE' });
  });
});
