"use strict"

const EdgeType =
{
	Vertical : 0,
	LeftToRight : 1,		// 우상향
	RightToLeft : 2			// 우하향
};

const ToggleViewMode =
{
	ByAltitude : -1,
	ByTerrain : 0,
	ByTemperature : 1,
	ByPrecipitation : 2
};

const TRMAXALTITUDE = 4;
const TRLANDALTITUDE = 2;

const LANDRATIO = 0.25;		// 전체 넓이 대 땅 넓이의 비율.
const MINCONTINENTAREA = 40;		// 대륙이 되기 위한 최소 넓이.

const PRDEFAULT = 0.0008;		// 0.0015 모든 타일의 기본 땅 생성 확률. 클수록 해안선이 복잡해진다.
const PRLANDCOEFF = 0.16;		// 0.08 기존의 땅 주변에서 또다른 땅이 생겨날 확률. 클수록 하나의 땅덩이가 넓어진다.
const PRROUGHCOEFF = 0.08;		// 0.2 기존의 땅이 높아질 확률. 낮으면 저지대가 많이 생성된다.
const PRTRYRIVER = 0.3;		// 조건이 되는 연안 타일들 중 실제로 강을 만들기 시작할 확률.
const PRTRYRIVERBRANCH = 0.06;	// 강이 분기할 확률.
const PRCOMPLEXCOASTLINE = 4;	// 복잡한 해안선을 만드는 루프를 반복할 횟수.

let canvas;
let bf;
let bmg;
let RetinaScale = 1;

const MinimumFrameTime = 10;

let IsRedrawingNeeded = false;
let IsAdditionalDrawingNeeded = false;

let _ScreenWidth;
let _ScreenHeight;

let TileSize = 24.0;
let CameraPosition = [0.0, 0.0];
let V = [0.0, 0.0];

let _TileSize;
let _CameraPosition = [0.0, 0.0];
let _V = [0.0, 0.0];

let map;
const MAPWIDTH = 180;
let IsMouseDown = false;

let OldMouse = [0, 0];
let OldSecondMouse = [0, 0];
let ToggleView = ToggleViewMode.ByTerrain;

function AngleOffset(y)
{
	let r = Mod(y, 2);
	return [[1, 0], [r, -1], [r - 1, -1], [-1, 0], [r - 1, 1], [r, 1] ];
}

class Tile
{
	constructor(x, y)
	{
		this.X = x;
		this.Y = y;
		this.IsContinent = false;
		this.IsShore = false;
		this.LandmassNumber = -1;
		this.tAltitude = 0;
	}

	get IsLand()
	{
		if (this.tAltitude >= TRLANDALTITUDE)
			return true;
		else
			return false;
	}
/*
	X;
	Y;

	IsContinent = false;	// 대륙이면 true, 섬이나 바다면 false.
	IsShore = false;		// 해안선에 인접해 있으면 true.
	LandmassNumber = -1;		// 땅덩이의 번호. Map 클래스에 땅덩이의 번호와 땅덩이의 면적이 짝지어져 있다.

	tAltitude = 0;				// 고도는 심해(0), 천해(1), 저지대(2), 중지대(3), 고지대(4)의 다섯 종류가 있다.
	tDistanceFromWest;	// 서쪽 해안으로부터의 거리.
	tDistanceFromEast;	// 동쪽 해안으로부터의 거리.
	tEffectiveDistance;	// 서쪽 해안과 동쪽 해안을 위도에 따라 가중치를 부여한 유효 거리.
	tVegetationColor;		// 식생에 의한 타일 색상.

	cMeanTemperature;		// 평균 기온은 대체로 위도가 낮을수록, 고도가 낮을수록, 따뜻한 바다에 가까울수록 높다.
	cTemperatureRange;	// 기온 범위는 대체로 고도가 높을수록, 바다에서 멀수록 크다.
	cTotalPrecipitation;	// 총 강수량은 대체로 위도가 중위도일수록, 고도가 낮을수록, 바다에 가까울수록 많다.
	cPrecipitationRange;	// 여름에 강수량이 많으면 (+), 겨울에 강수량이 많으면 (-).
	*/
};

class Edge
{
	constructor(t, x, y)
	{
		this.Type = t;
		this.X = x;
		this.Y = y;
		this.isRiver = false;
	}

	VertexTiles(width, height)
	{
		let r = Mod(this.Y, 2);
		let t1, t2;

		if (this.Type == EdgeType.Vertical)
		{
			// 01이면 00과 02
			// 00이면 -1-1과 -11
			t1 = [Mod(this.X + r - 1, width), this.Y - 1];
			t2 = [Mod(this.X + r - 1, width), this.Y + 1];
		}
		else if (this.Type == EdgeType.LeftToRight)
		{
			// 11이면 20과 01
			// 12이면 11과 02
			t1 = [Mod(this.X + r, width), this.Y - 1];
			t2 = [Mod(this.X - 1, width), this.Y];
		}
		else
		{
			// 01이면 00과 11
			// 12이면 01과 22
			t1 = [Mod(this.X + r - 1, width), this.Y - 1];
			t2 = [Mod(this.X + 1, width), this.Y];
		}
		if (t1[1] < 0)
			return [t2];
		else if (t2[1] >= height)
			return [t1];
		else
			return [t1, t2];
	}

	SideTiles(width, height)
	{
		let r = Mod(this.Y, 2);
		let t1, t2;

		if (this.Type == EdgeType.Vertical)
		{
			// 10이면 00과 10
			// 11이면 01과 11
			t1 = [Mod(this.X - 1, width), this.Y];
			t2 = [this.X, this.Y];
		}
		else if (this.Type == EdgeType.LeftToRight)
		{
			// 01이면 00과 01
			// 12이면 01과 12
			t1 = [Mod(this.X + r - 1, width), this.Y - 1];
			t2 = [this.X, this.Y];
		}
		else
		{
			// 01이면 10과 01
			// 02이면 01과 02
			t1 = [Mod(this.X + r, width), this.Y - 1];
			t2 = [this.X, this.Y];
		}
		if (t1[1] < 0)
			return [t2];
		else if (t2[1] >= height)
			return [t1];
		else
			return [t1, t2];
	}

	OtherEdges(width, height, onetiley)
	{
		let r = Mod(this.Y, 2);
		let t1, t2;
		let e1, e2;

		if (this.Type == EdgeType.Vertical)
		{
			// 01이면 00과 02
			// 00이면 -1-1과 -11
			t1 = [Mod(this.X + r - 1, width), this.Y - 1];
			t2 = [Mod(this.X + r - 1, width), this.Y + 1];
		}
		else if (this.Type == EdgeType.LeftToRight)
		{
			// 11이면 20과 01
			// 12이면 11과 02
			t1 = [Mod(this.X + r, width), this.Y - 1];
			t2 = [Mod(this.X - 1, width), this.Y];
		}
		else
		{
			// 01이면 00과 11
			// 12이면 01과 22
			t1 = [Mod(this.X + r - 1, width), this.Y - 1];
			t2 = [Mod(this.X + 1, width), this.Y];
		}
		if (t1[1] < 0 || t2[1] >= height)
			return [];
		else
		{
			if (t1[1] == onetiley)		// 시작하는 타일이 위에 있을 경우
			{
				if (this.Type == EdgeType.Vertical)
				{
					// 10이면 01과 01
					// 01이면 02와 02
					e1 = [EdgeType.LeftToRight, Mod(this.X + r - 1, width), this.Y + 1];
					e2 = [EdgeType.RightToLeft, Mod(this.X + r - 1, width), this.Y + 1];
				}
				else if (this.Type == EdgeType.LeftToRight)
				{
					// 11이면 우하향01과 수직11
					// 12이면 우하향02와 수직12
					e1 = [EdgeType.RightToLeft, Mod(this.X - 1, width), this.Y];
					e2 = [EdgeType.Vertical, this.X, this.Y];
				}
				else
				{
					// 01이면 우상향11과 수직11
					// 02이면 우상향12와 수직12
					e1 = [EdgeType.LeftToRight, Mod(this.X + 1, width), this.Y];
					e2 = [EdgeType.Vertical, Mod(this.X + 1, width), this.Y];
				}
			}
			else	// 시작하는 타일이 아래에 있을 경우
			{
				if (this.Type == EdgeType.Vertical)
				{
					// 11이면 우하향01과 우상향11
					// 12이면 우하향02와 우상향12
					e1 = [EdgeType.RightToLeft, Mod(this.X - 1, width), this.Y];
					e2 = [EdgeType.LeftToRight, this.X, this.Y];
				}
				else if (this.Type == EdgeType.LeftToRight)
				{
					// 01이면 수직10과 우하향01
					// 12이면 수직11과 우하향12
					e1 = [EdgeType.Vertical, Mod(this.X + r, width), this.Y - 1];
					e2 = [EdgeType.RightToLeft, this.X, this.Y];
				}
				else
				{
					// 01이면 수직10과 우상향01
					// 02이면 수직01과 우상향02
					e1 = [EdgeType.Vertical, Mod(this.X + r, width), this.Y - 1];
					e2 = [EdgeType.LeftToRight, this.X, this.Y];
				}
			}
			return [e1, e2];
		}
	}
}

function EdgeBetweenTiles(x1, y1, x2, y2, width)
{
	let r;
	if (y1 > y2 || (y1 == y2 && Mod(x1 - x2, width) == 1))
	{
		r = Mod(y1, 2);
		return [(y1 - y2) * Mod(x2 + 2 - x1 - r, width), x1, y1];
	}
	else
	{
		r = Mod(y2, 2);
		return [(y2 - y1) * Mod(x1 + 2 - x2 - r, width), x2, y2];
	}
}

class Civilization
{
	constructor(pop, x, y)
	{
		this.Population = pop;
		this.Position = [x, y];
	}
}

class Map
{
	// public int[,] AIPositions;
	
	// 무작위 맵 생성자. 육각형 타일을 기본으로 한다.
	constructor(width)
	{
		// 좌우길이만 정해주면 상하길이는 루트 3으로 나눠준다.
		this.Width = width;
		this.Height = Math.round(width / Math.sqrt(3));

		this.LandmassAreas = [];
		//this.PlayerCivilization = new Civilization(10);
		this.PlayerPosition = [];
		
		// 타일과 강들을 초기화시켜준다.
		this.Tiles = new Array(this.Width);
		this.Rivers = new Array(3);
		this.Rivers[EdgeType.Vertical] = new Array(this.Width);
		this.Rivers[EdgeType.LeftToRight] = new Array(this.Width);
		this.Rivers[EdgeType.RightToLeft] = new Array(this.Width);
		for (let i = 0; i < this.Width; i++)
		{
			this.Tiles[i] = new Array(this.Height);
			this.Rivers[EdgeType.Vertical][i] = new Array(this.Height);
			this.Rivers[EdgeType.LeftToRight][i] = new Array(this.Height);
			this.Rivers[EdgeType.RightToLeft][i] = new Array(this.Height);
			for (let j = 0; j < this.Height; j++)
			{
				this.Tiles[i][j] = new Tile(i, j);
				this.Rivers[EdgeType.Vertical][i][j] = new Edge(EdgeType.Vertical, i, j);
				this.Rivers[EdgeType.LeftToRight][i][j] = new Edge(EdgeType.LeftToRight, i, j);
				this.Rivers[EdgeType.RightToLeft][i][j] = new Edge(EdgeType.RightToLeft, i, j);
			}
		}
		
		// 타일마다 자라날 확률을 정해준다.
		let p_tiles = new Array(this.Width);

		// 대륙이 될 씨앗을 세 개 뿌린다.
		for (let i = 0; i < 3; i++)
		{
			let sx = Math.floor(Math.random() * this.Width);
			let sy = Math.floor(Math.random() * this.Height);
			this.Tiles[sx][sy].tAltitude = TRLANDALTITUDE;
		}

		// 씨앗으로부터 대륙을 키워나간다.
		let NoContinents = true;
		while (NoContinents)
		{
			while (true)
			{
				// 땅의 총 넓이를 세고, 비율이 LANDRATIO 이상이면 나간다.
				let LandArea = 0;
				for (let x = 0; x < this.Width; x++)
				{
					p_tiles[x] = new Array(this.Height);
					for (let y = 0; y < this.Height; y++)
					{
						p_tiles[x][y] = PRDEFAULT;
						if (this.Tiles[x][y].IsLand)
							LandArea++;
					}
				}
				if (LandArea >= this.Width * this.Height * LANDRATIO)
					break;

				// 각 타일의 땅이 생길 확률을 구한다.
				for (let x = 0; x < this.Width; x++)
				{
					for (let y = 0; y < this.Height; y++)
					{
						let v = this.Neighbors(x, y, 1);

						for (let i = 0; i < v.length; i++)
						{
							let xx = v[i][0];
							let yy = v[i][1];
							if (yy >= 0 && yy < this.Height)
								p_tiles[Mod(xx, this.Width)][yy] += Math.min(this.Tiles[x][y].tAltitude, TRLANDALTITUDE + 0.1 * (this.Tiles[x][y].tAltitude - TRLANDALTITUDE)) * PRLANDCOEFF;
						}

						v = this.Neighbors(x, y, 2);
						for (let i = 0; i < v.length; i++)
						{
							let xx = v[i][0];
							let yy = v[i][1];
							if (yy >= 0 && yy < this.Height)
								p_tiles[Mod(xx, this.Width)][yy] += Math.min(this.Tiles[x][y].tAltitude, TRLANDALTITUDE + 0.1 * (this.Tiles[x][y].tAltitude - TRLANDALTITUDE)) * PRLANDCOEFF / 4.0;
						}
					}
				}
				// 최종 확률에 따라 각 타일을 성장시킨다. 최종 확률은 위도에 따라 보정된다.
				for (let x = 0; x < this.Width; x++)
				{
					for (let y = 0; y < this.Height; y++)
					{
						let p = Math.random();
						let lat = (this.Height - 1.0 - 2 * y) / this.Height;
						if (p <= p_tiles[x][y] * (1 - lat * lat * 0.3))
						{
							let r;
							if (this.Tiles[x][y].IsLand)
							{
								p = Math.random();
								if (p <= PRROUGHCOEFF)
									r = 1;
								else
									r = 0;
							}
							else
								r = 1;
							this.Tiles[x][y].tAltitude = Math.min(this.Tiles[x][y].tAltitude + r, TRMAXALTITUDE);
						}
					}
				}
			}

			// 복잡한 해안선을 만든다.
			for (let k = 0; k < PRCOMPLEXCOASTLINE; k++)
			{
				for (let x = 0; x < this.Width; x++)
				{
					for (let y = 0; y < this.Height; y++)
					{
						let v = this.Neighbors(x, y, 1);
						let nn = 0;
						let p = Math.random();
						for (let i = 0; i < v.length; i++)
						{
							let xx = v[i][0];
							let yy = v[i][1];
							if (yy >= 0 && yy < this.Height && this.Tiles[Mod(xx, this.Width)][yy].IsLand)
								nn++;
						}
						if ((nn >= 4 && nn <= 5) && this.Tiles[x][y].IsLand && p <= PRLANDCOEFF / (6 - nn))
							p_tiles[x][y] = -1;
						else if ((nn == 1 || nn == 2) && !this.Tiles[x][y].IsLand && p <= PRLANDCOEFF / nn)
							p_tiles[x][y] = 1;
						else
							p_tiles[x][y] = 0;
					}
				}
				for (let x = 0; x < this.Width; x++)
				{
					for (let y = 0; y < this.Height; y++)
					{
						this.Tiles[x][y].tAltitude = AB(this.Tiles[x][y].tAltitude + p_tiles[x][y], 0, TRMAXALTITUDE);
					}
				}
			}

			// flood-fill 알고리즘으로 총 땅덩이의 수를 센다.
			let LandmassCount = 0;
			this.LandmassAreas = [];
			for (let x = 0; x < this.Width; x++)
			{
				for (let y = 0; y < this.Height; y++)
				{
					if (this.Tiles[x][y].IsLand && this.Tiles[x][y].LandmassNumber == -1)
					{
						this.LandmassAreas.push(this.FloodFill(x, y, LandmassCount));
						LandmassCount++;
					}
				}
			}

			// 땅덩이 중 대륙이라고 부를 만한 땅덩이가 없으면 지도를 다시 만든다.
			for (let i = 0; i < LandmassCount; i++)
			{
				if (this.LandmassAreas[i] >= MINCONTINENTAREA)
					NoContinents = false;
			}
		}

		// 타일의 여러 속성들을 정해준다.
		for (let x = 0; x < this.Width; x++)
		{
			for (let y = 0; y < this.Height; y++)
			{
				// isContinent 속성을 정해준다.
				if (this.Tiles[x][y].IsLand && this.LandmassAreas[this.Tiles[x][y].LandmassNumber] >= MINCONTINENTAREA)
					this.Tiles[x][y].IsContinent = true;

				// isShore 속성을 정해준다.
				let v = this.Neighbors(x, y, 1);
				for (let i = 0; i < v.length; i++)
				{
					let xx = v[i][0];
					let yy = v[i][1];
					if (yy >= 0 && yy < this.Height)
						if (this.Tiles[x][y].IsLand != this.Tiles[Mod(xx, this.Width)][yy].IsLand)
							this.Tiles[x][y].IsShore = true;
				}

				// 땅 바로 옆에는 심해가 없도록 해준다.
				if (!this.Tiles[x][y].IsLand && this.Tiles[x][y].IsShore)
					this.Tiles[x][y].tAltitude = 1;
			}
		}

		// 강을 규칙에 따라 생성시킨다.
		// 연안 타일에서부터 강을 만들기 시작한다.
		let ShoreTiles = [];
		for (let i = 0; i < this.Tiles.length; i++)
		{
			for (let j = 0; j < this.Tiles[i].length; j++)
			{
				if (!this.Tiles[i][j].IsLand && this.Tiles[i][j].IsShore)
				{
					ShoreTiles.push([i, j]);
				}
			}
		}

		let queue = [];

		// 연안을 따라 큐에 강 후보지들을 넣는다.
		for (let k = 0; k < ShoreTiles.length; k++)
		{
			let ss = ShoreTiles[k];
			let x = ss[0];
			let y = ss[1];
			let oyy = 0;		// 시작 타일의 y좌표.

			let edge = [];

			let v = this.Neighbors(x, y, 1);

			if (v.length < 6)
				continue;

			// 바다 타일과 땅 타일 사이의 변을 시작점으로 집어넣는다.
			for (let i = 0; i < v.length; i++)
			{
				if (this.Tiles[v[i][0]][v[i][1]].tAltitude == TRLANDALTITUDE)
				{
					edge = EdgeBetweenTiles(x, y, v[i][0], v[i][1], this.Width);
					if (this.Tiles[v[Mod(i + 1, 6)][0]][v[Mod(i + 1, 6)][1]].tAltitude == TRLANDALTITUDE && !this.Tiles[v[Mod(i - 1, 6)][0]][v[Mod(i - 1, 6)][1]].IsLand)
						oyy = v[Mod(i - 1, 6)][1];
					else if (!this.Tiles[v[Mod(i + 1, 6)][0]][v[Mod(i + 1, 6)][1]].IsLand && this.Tiles[v[Mod(i - 1, 6)][0]][v[Mod(i - 1, 6)][1]].tAltitude == TRLANDALTITUDE)
						oyy = v[Mod(i + 1, 6)][1];
					else if (this.Tiles[v[Mod(i + 1, 6)][0]][v[Mod(i + 1, 6)][1]].tAltitude == TRLANDALTITUDE && this.Tiles[v[Mod(i - 1, 6)][0]][v[Mod(i - 1, 6)][1]].tAltitude == TRLANDALTITUDE)
					{
						if (Math.random() < 0.5)
							oyy = v[Mod(i - 1, 6)][1];
						else
							oyy = v[Mod(i + 1, 6)][1];
					}
					let p = Math.random();
					if (p <= PRTRYRIVER)
						queue.push([edge[0], edge[1], edge[2], oyy]);
				}
			}
		}
		// 큐가 비어있지 않다면 강을 연장할 수 있는지 알아보고 확률에 따라 연장한다.
		while (queue.length > 0)
		{
			let q = queue.splice(0, 1)[0];

			let Candidates = this.Rivers[q[0]][q[1]][q[2]].OtherEdges(this.Width, this.Height, q[3]);
			let Scores = [0.0, 0.0];
			if (Candidates.length < 2)
				continue;

			let Sides = [ this.Rivers[Candidates[0][0]][Candidates[0][1]][Candidates[0][2]].SideTiles(this.Width, this.Height),
																this.Rivers[Candidates[1][0]][Candidates[1][1]][Candidates[1][2]].SideTiles(this.Width, this.Height) ];
			let Vertices = [ this.Rivers[Candidates[0][0]][Candidates[0][1]][Candidates[0][2]].VertexTiles(this.Width, this.Height),
																this.Rivers[Candidates[1][0]][Candidates[1][1]][Candidates[1][2]].VertexTiles(this.Width, this.Height) ];
			let Bases = [[], []]
			let Directs = [[], []];
			let NextCandidates = [[[], []], [[], []]];
			let Nears = [[[], []], [[], []]];
			for (let i = 0; i < 2; i++)
			{
				if (Vertices[i].length < 2)
					continue;

				if (Vertices[i][0].every((val, index) => val === Sides[1 - i][0][index]) || Vertices[i][0].every((val, index) => val === Sides[1 - i][1][index]))
				{
					Bases[i] = Vertices[i][0];
					Directs[i] = Vertices[i][1];
				}
				else
				{
					Bases[i] = Vertices[i][1];
					Directs[i] = Vertices[i][0];
				}

				NextCandidates[i][0] = EdgeBetweenTiles(Directs[i][0], Directs[i][1], Sides[i][0][0], Sides[i][0][1], this.Width);
				NextCandidates[i][1] = EdgeBetweenTiles(Directs[i][0], Directs[i][1], Sides[i][1][0], Sides[i][1][1], this.Width);

				Nears[i] = this.Neighbors(Directs[i][0], Directs[i][1], 1).concat(this.Neighbors(Directs[i][0], Directs[i][1], 2));

				// 주변에 저지대가 많을수록 좋은 후보.
				let NearLandCount = 0;
				for (let j = 0; j < Nears[i].length; j++)
				{
					if (this.Tiles[Nears[i][j][0]][Nears[i][j][1]].IsLand)
						NearLandCount++;
					if (this.Tiles[Nears[i][j][0]][Nears[i][j][1]].tAltitude == TRLANDALTITUDE)
						Scores[i] += 0.05;
				}
				Scores[i] /= NearLandCount;
				// 강이 해안선과 평행하게 흐를 수는 없다.
				if (!this.Tiles[Sides[i][0][0]][Sides[i][0][1]].IsLand || !this.Tiles[Sides[i][1][0]][Sides[i][1][1]].IsLand)
					Scores[i] -= 999;
				// 양쪽 강변의 고도가 낮을수록 좋은 후보.
				Scores[i] += 0.25 * (TRMAXALTITUDE - (this.Tiles[Sides[i][0][0]][Sides[i][0][1]].tAltitude + this.Tiles[Sides[i][1][0]][Sides[i][1][1]].tAltitude) / 2);
				// 양쪽 강변의 고도가 차이가 덜 날수록 좋은 후보.
				Scores[i] -= 0.95 * (Math.abs(this.Tiles[Sides[i][0][0]][Sides[i][0][1]].tAltitude - this.Tiles[Sides[i][1][0]][Sides[i][1][1]].tAltitude) - 0.5 * (TRMAXALTITUDE - TRLANDALTITUDE));
				// 강을 더 놓았을 때 기존의 강과 연결되는 것은 되도록이면 피할 것.
				if (this.Rivers[NextCandidates[i][0][0]][NextCandidates[i][0][1]][NextCandidates[i][0][2]].isRiver || this.Rivers[NextCandidates[i][1][0]][NextCandidates[i][1][1]][NextCandidates[i][1][2]].isRiver)
					Scores[i] -= 0.9;
				// 강은 거꾸로 흐를 수 없다.
				if (this.Tiles[Bases[i][0]][Bases[i][1]].tAltitude > this.Tiles[Directs[i][0]][Directs[i][1]].tAltitude)
					Scores[i] -= 999;
				// 바다에서 바다로 흐를 수 없다.
				if (!this.Tiles[Directs[i][0]][Directs[i][1]].IsLand)
					Scores[i] -= 999;

			}
			// 두 후보 중 더 확률이 큰 쪽으로 강을 연장하고 두 번째 후보는 더 낮은 확률로 연장된다.
			let p = Math.random();
			let ii;

			if (Scores[0] > Scores[1] || (Scores[0] == Scores[1] && Math.random() < 0.5))
				ii = 0;
			else
				ii = 1;

			if (p <= Scores[ii] && !this.Rivers[Candidates[ii][0]][Candidates[ii][1]][Candidates[ii][2]].isRiver)
			{
				this.Rivers[Candidates[ii][0]][Candidates[ii][1]][Candidates[ii][2]].isRiver = true;
				queue.push([ Candidates[ii][0], Candidates[ii][1], Candidates[ii][2], Bases[ii][1] ]);
			}
			// 두 번째 후보의 확률은 PRTRYRIVER만큼 줄어든다.
			p = Math.random();
			ii = 1 - ii;
			if (p <= Scores[ii] * PRTRYRIVERBRANCH && !this.Rivers[Candidates[ii][0]][Candidates[ii][1]][Candidates[ii][2]].isRiver)
			{
				this.Rivers[Candidates[ii][0]][Candidates[ii][1]][Candidates[ii][2]].isRiver = true;
				queue.push([ Candidates[ii][0], Candidates[ii][1], Candidates[ii][2], Bases[ii][1] ]);
			}
		}

		// 기후 변수들을 할당해준다.
		// 우선 깊은 바다로부터의 거리를 정해준다.
		for (let y = 0; y < this.Height; y++)
		{
			for (let x = 0; x < this.Width; x++)
			{
				if (this.Tiles[x][y].tAltitude == 0)
				{
					let n = 0;
					let sw = 0;     // 연속된 해안 타일의 수. 특정 개수 이상 연속으로 반복되면 바다 타일과 같은 효과를 가진다.
					let se = 0;
					let dw = 0;
					let de = 0;
					while (true)
					{
						n++;
						if (Mod(n, this.Width) == 0)
							break;
						if (this.Tiles[Mod(x + n, this.Width)][y].tAltitude == 0)
							dw = 0;
						else if (!this.Tiles[Mod(x + n, this.Width)][y].IsLand)
						{
							if (++sw >= 3)
								dw = 0;
							dw += 0.1;
						}
						else
						{
							dw += 0.5 * this.Tiles[Mod(x + n, this.Width)][y].tAltitude;
							sw = 0;
						}
						if (this.Tiles[Mod(x - n, this.Width)][y].tAltitude == 0)
							de = 0;
						else if (!this.Tiles[Mod(x - n, this.Width)][y].IsLand)
						{
							if (++se >= 3)
								de = 0;
							de += 0.1;
						}
						else
						{
							de += 0.5 * this.Tiles[Mod(x - n, this.Width)][y].tAltitude;
							se = 0;
						}
						this.Tiles[Mod(x + n, this.Width)][y].tDistanceFromWest = dw;
						this.Tiles[Mod(x - n, this.Width)][y].tDistanceFromEast = de;
					}
					break;
				}
			}
		}
		// 기후 변수를 계산하고, 동시에 자원도 배치한다.
		for (let x = 0; x < this.Width; x++)
		{
			for (let y = 0; y < this.Height; y++)
			{
				// 유효거리는 서쪽 해안에서부터 잰 거리와 동쪽 해안에서부터 잰 거리를 위도에 따라 합성한 거리이다.
				let lat = (this.Height - 1.0 - 2 * y) / this.Height;
				let alpha = (Math.cos(Math.PI * lat) + 1) / 2;
				this.Tiles[x][y].tEffectiveDistance = (this.Tiles[x][y].tDistanceFromWest * this.Tiles[x][y].tDistanceFromEast) / (alpha * this.Tiles[x][y].tDistanceFromWest + (1 - alpha) * this.Tiles[x][y].tDistanceFromEast + 1);
				// 강수량은 위도가 낮을수록 많은데, 30도 부근에서 최저치가 되도록 보정항이 있고, 유효거리가 멀수록, 고도가 높을수록 추가로 감소한다.
				this.Tiles[x][y].cTotalPrecipitation = 15000 * Math.pow(5, -3 * Math.abs(lat) / 2) * (1 - 0.95 / ((Math.abs(lat) - 0.25) * (Math.abs(lat) - 0.25) * 23 + 1)) * (1 - lat * lat) * Math.pow(2, -(this.Tiles[x][y].tEffectiveDistance * 0.11) - (this.Tiles[x][y].tAltitude - TRLANDALTITUDE));
				// 강수량 범위는 (서쪽 해안으로부터의 거리)-(동쪽 해안으로부터의 거리)에 따라 부호가 바뀐다.
				this.Tiles[x][y].cPrecipitationRange = this.Tiles[x][y].cTotalPrecipitation * Math.tanh((this.Tiles[x][y].tDistanceFromWest - this.Tiles[x][y].tDistanceFromEast) / 10) * (1 - lat * lat);
				// 평균 온도는 주되게는 위도가 낮을수록 높고, 바닷바람이 적게 불수록 증가하고, 고도가 높을수록 감소한다. 강수량이 많으면 추가적으로 감소한다.
				this.Tiles[x][y].cMeanTemperature = Math.cos(lat * Math.PI / 2) * 68 - this.Tiles[x][y].cTotalPrecipitation * 0.002 - 5 * (this.Tiles[x][y].tAltitude - TRMAXALTITUDE) - 44;
				// 온도 범위는 위도가 높아질수록, 해안으로부터의 거리가 멀어질수록 넓어진다.
				this.Tiles[x][y].cTemperatureRange = Math.abs(lat * 11.7 * Math.pow(this.Tiles[x][y].tEffectiveDistance * 40000 / this.Width, 0.2));
				// 식생에 의한 색깔은 강수량에 크게 의존하고 온도에도 의존한다.
				let VI = Math.tanh(Math.max(this.Tiles[x][y].cTotalPrecipitation / 500 - 0.2, 0));
				let PolarCapFactor = 0.5 * Math.tanh(-(this.Tiles[x][y].cMeanTemperature + this.Tiles[x][y].cTemperatureRange / 2)) + 0.5;
				let TundraFactor = 0.5 * Math.tanh(-(this.Tiles[x][y].cMeanTemperature + this.Tiles[x][y].cTemperatureRange / 2) / 2 + 4.5) + 0.5;
				this.Tiles[x][y].tVegetationColor = FromHSV(70 * VI + 20 + 30 * TundraFactor, AB(0.75 * VI + 0.25 - 0.3 * TundraFactor - PolarCapFactor, 0, 1), Math.min(0.37 * VI + 0.85 * (1 - VI) - 0.1 * TundraFactor + PolarCapFactor, 1));
				// 식량 자원을 배치한다.

			}
		}

		// 플레이어의 위치를 정해준다. AI들도 위치시켜야 한다.
		let ct = [];
		for (let x = 0; x < this.Tiles.length; x++)
		{
			for (let y = 0; y < this.Tiles[x].length; y++)
			{
				if (this.Tiles[x][y].IsContinent)
				{
					ct.push([x, y]);
				}
			}
		}
		this.PlayerPosition = ct[Math.floor(Math.random() * ct.length)];
		this.PlayerCivilization = new Civilization(10, this.PlayerPosition[0], this.PlayerPosition[1]);
	}

	FloodFill(x, y, num)
	{
		if (this.Tiles[x][y].tAltitude < TRLANDALTITUDE)
			return 0;
		let area = 0;
		let queue = [[x, y]];
		while (queue.length > 0)
		{
			let xx, yy;
			let tt = queue.splice(0, 1)[0];
			xx = tt[0];
			yy = tt[1];
			let west = [ xx, yy ];
			let east = [ xx, yy ];
			while (this.Tiles[Mod((west[0] - 1), this.Width)][west[1]].LandmassNumber == -1 && this.Tiles[Mod((west[0] - 1), this.Width)][west[1]].IsLand)
			{
				west[0]--;
			}
			while (this.Tiles[Mod((east[0] + 1), this.Width)][east[1]].LandmassNumber == -1 && this.Tiles[Mod((east[0] + 1), this.Width)][east[1]].IsLand)
				east[0]++;
			for (let i = west[0]; i <= east[0]; i++)
			{
				if (this.Tiles[Mod(i, this.Width)][yy].LandmassNumber == -1)
				{
					this.Tiles[Mod(i, this.Width)][yy].LandmassNumber = num;
					area++;
				}
				let r = Mod(yy, 2);
				if (yy > 0)
				{
					if (this.Tiles[Mod((i - 1 + r), this.Width)][yy - 1].LandmassNumber == -1 && this.Tiles[Mod((i - 1 + r), this.Width)][yy - 1].IsLand)
						queue.push([ Mod((i - 1 + r), this.Width), yy - 1 ]);
					else if (this.Tiles[Mod((i + r), this.Width)][yy - 1].LandmassNumber == -1 && this.Tiles[Mod((i + r), this.Width)][yy - 1].IsLand)
						queue.push([ Mod((i + r), this.Width), yy - 1 ]);
				}
				if (yy < this.Height - 1)
				{
					if (this.Tiles[Mod((i - 1 + r), this.Width)][yy + 1].LandmassNumber == -1 && this.Tiles[Mod((i - 1 + r), this.Width)][yy + 1].IsLand)
						queue.push([ Mod((i - 1 + r), this.Width), yy + 1 ]);
					else if (this.Tiles[Mod((i + r), this.Width)][yy + 1].LandmassNumber == -1 && this.Tiles[Mod((i + r), this.Width)][yy + 1].IsLand)
						queue.push([ Mod((i + r), this.Width), yy + 1 ]);
				}
			}
		}
		return area;
	}

	Neighbors(x, y, distance)
	{
		let nn = [];
		let temp = [ x, y ];

		if (distance == 0)
			return [x, y];
		else
		{
			temp[0] -= distance;
			for (let i = 0; i < 6; i++)
			{
				for (let j = 0; j < distance; j++)
				{
					if (temp[1] >= 0 && temp[1] < this.Height)
						nn.push([ Mod(temp[0], this.Width), temp[1] ]);
					let offset = AngleOffset(temp[1])[Mod(i - 1, 6)];
					temp[0] += offset[0];
					temp[1] += offset[1];
				}
			}
		}
		return nn;
	}

	HuntGatherMove(dx, dy)
	{
		if (this.Tiles[Mod((PlayerPosition[0] + dx), this.Width)][AB(PlayerPosition[1] + dy, 0, this.Height - 1)].IsLand)
		{
			PlayerPosition[0] = Mod((PlayerPosition[0] + dx), this.Width);
			PlayerPosition[1] = AB(PlayerPosition[1] + dy, 0, this.Height - 1);
		}
	}
}

function AB(x, a, b)
{
	if (a > b)
		return a;					// 하한이 상한보다 크면 하한을 리턴한다.
	else if (x > b)
		return b;
	else if (x < a)
		return a;
	else
		return x;
}

function Mod(a, b)
{
	return (a - b * Math.floor(a * 1.0 / b));
}

function main()
{
	try
	{
		canvas = document.getElementById("canvas");
		let w = document.body.clientWidth;
		let h = document.body.clientHeight;
		RetinaScale = ("devicePixelRatio" in window) ? window.devicePixelRatio : 1;
		//RetinaScale = 4;
		canvas.width = w * RetinaScale;
		canvas.height = h * RetinaScale;
		canvas.style.width = w + "px";
		canvas.style.height = h + "px";
	
		//bf = canvas.transferControlToOffscreen();
		bf = canvas;
		bmg = bf.getContext("2d");
		bmg.scale(RetinaScale, RetinaScale);
		//let DrawingThread = setInterval(DrawLoadingScreen, 500);
		//DrawLoadingScreen();
		RegisterEvents();
		InitializeGame();

		IsRedrawingNeeded = true;
		Draw();
	}
	catch (error)
	{
		alert(error);
	}
	//clearInterval(DrawingThread);
}

function RegisterEvents()
{
	bf.addEventListener("touchstart", TouchStart, false);
	bf.addEventListener("touchend", TouchEnd, false);
	bf.addEventListener("touchmove", TouchMove, false);
	bf.addEventListener("touchcancel", TouchEnd, false);
}

function TouchStart(evt)
{
	evt.preventDefault();
	var touches = evt.touches;
	if (touches.length >= 1)
	{
		IsMouseDown = true;
		OldMouse[0] = touches[0].pageX;
		OldMouse[1] = touches[0].pageY;
		V[0] = 0.0;
		V[1] = 0.0;
	}
	if (touches.length >= 2)
	{
		OldSecondMouse = [touches[1].pageX, touches[1].pageY];
	}
}

function TouchMove(evt)
{
	evt.preventDefault();
	var touches = evt.touches;

	if (touches.length == 1)
	{
		V[0] = OldMouse[0] - touches[0].pageX;
		V[1] = OldMouse[1] - touches[0].pageY;
		ScrollMap(V[0], V[1]);
		OldMouse = [touches[0].pageX, touches[0].pageY];
		IsRedrawingNeeded = true;
	}
	else if (touches.length >= 2)
	{
		let newdx = touches[0].pageX - touches[1].pageX;
		let newdy = touches[0].pageY - touches[1].pageY;
		let olddx = OldMouse[0] - OldSecondMouse[0];
		let olddy = OldMouse[1] - OldSecondMouse[1];

		let viewdx = (OldMouse[0] + OldSecondMouse[0] - touches[0].pageX - touches[1].pageX) / 2;
		let viewdy = (OldMouse[1] + OldSecondMouse[1] - touches[0].pageY - touches[1].pageY) / 2;
		
		let NewTileSize = AB(TileSize * Math.sqrt((newdx * newdx + newdy * newdy) / (olddx * olddx + olddy * olddy)), document.body.clientHeight / (map.Height + 1) * 2 / Math.sqrt(3), 300);
		let r = NewTileSize / TileSize;
		TileSize = NewTileSize;
		CameraPosition[0] = Mod(r * CameraPosition[0] + viewdx, map.Width * TileSize);
		CameraPosition[1] = AB(r * CameraPosition[1] + viewdy, document.body.clientHeight / 2 - TileSize * Math.sqrt(3) / 4, (map.Height + 0.5) * TileSize * Math.sqrt(3) / 2 - document.body.clientHeight / 2);
		//Draw();
		OldMouse = [touches[0].pageX, touches[0].pageY];
		OldSecondMouse = [touches[1].pageX, touches[1].pageY];
		IsRedrawingNeeded = true;
	}
}

function TouchEnd(evt)
{
	evt.preventDefault();
	var touches = evt.touches;

	if (touches.length == 0)
	{
		IsMouseDown = false;
	}
	else if (touches.length == 1)
	{
		OldMouse = [touches[0].pageX, touches[0].pageY];
	}
	else if (touches.length >= 2)
	{
		OldMouse = [touches[0].pageX, touches[0].pageY];
		OldSecondMouse = [touches[1].pageX, touches[1].pageY];
	}
}

function Draw()
{
	window.requestAnimationFrame(Draw);

	// 중간에 값이 변경되면 맵이 깨지므로 처음의 변수 값들을 미리 기록해둔다.
	_ScreenWidth = document.body.clientWidth;
	_ScreenHeight = document.body.clientHeight;
	_TileSize = TileSize;
	_CameraPosition = CameraPosition.slice();
	_V = V.slice();
	//IsRedrawingNeeded = true;
	
	// 속도를 업데이트해준다.
	if (!IsMouseDown)
	{
		V[0] *= 0.9;
		V[1] *= 0.9;
		if (V[0] < 1 && V[0] > -1)
			V[0] = 0;
		if (V[1] < 1 && V[1] > -1)
			V[1] = 0;
		if (V[0] != 0 || V[1] != 0)
		{
			ScrollMap(V[0], V[1]);
			IsRedrawingNeeded = true;
		}
	}
	else
	{
		V = [0.0, 0.0];
	}
	// 다시 그려야 하거나 한 프레임 더 그려야 하면 맵부터 그리고 타일 선택된거 그리고 문명 그리고 인터페이스도 그린다.
	if (IsRedrawingNeeded || IsAdditionalDrawingNeeded)
	{
		bmg.clearRect(0, 0, _ScreenWidth, _ScreenHeight);
		DrawMap();
		/*
		canvas.getContext("2d").clearRect(0, 0, _ScreenWidth, _ScreenHeight);
		canvas.getContext("2d").drawImage(bf, 0, 0);
		*/
		DrawDebug();
		if (IsRedrawingNeeded)
			IsAdditionalDrawingNeeded = true;
		else
			IsAdditionalDrawingNeeded = false;
		IsRedrawingNeeded = false;
	}

	//setTimeout(Draw, 50);
}
		
function DrawMap()
{
	let c = "";
	//bmg.clearRect(0, 0, _ScreenWidth, _ScreenHeight);

	let RiverLines = [];

	// 육각형 타일을 그린다.
	let xy = PixelToTile(-1, -1);
	let x, y;
	let temp = [];
	let a0 = _TileSize;
	let x0, y0;
	for (let i = -1; i < _ScreenWidth / _TileSize + 2; i++)
	{
		for (let j = -1; j < _ScreenHeight * 2 / Math.sqrt(3) / _TileSize + 1; j++)
		{
			x = Mod(xy[0] + i, map.Width);
			y = xy[1] + j;
			if (y < 0 || y >= map.Height)
				c = "black";
			else if (map.Tiles[x][y].tAltitude <= 1)
			{
				c = FromLegend(ToggleViewMode.ByAltitude, map.Tiles[x][y].tAltitude);
			}
			else
			{
				switch (ToggleView)
				{
					case ToggleViewMode.ByTemperature:
						c = FromLegend(ToggleView, map.Tiles[x][y].cMeanTemperature);
						break;
					case ToggleViewMode.ByPrecipitation:
						c = FromLegend(ToggleView, map.Tiles[x][y].cTotalPrecipitation);
						break;
					case ToggleViewMode.ByTerrain:
						//c = FromLegend(ToggleViewMode.ByAltitude, map.Tiles[x, y].tAltitude);
						c = map.Tiles[x][y].tVegetationColor;
						break;
					default:
						c = "black";
						break;
				}
			}

			temp = TileToPixel(x, y);
			x0 = temp[0];
			y0 = temp[1];

			let pts = [ [(x0 - a0 / 2.0), (y0 - a0 / 2.0 / Math.sqrt(3))],
										[(x0 - a0 / 2.0), (y0 + a0 / 2.0 / Math.sqrt(3))],
										[(x0), (y0 + a0 / Math.sqrt(3))],
										[(x0 + a0 / 2.0), (y0 + a0 / 2.0 / Math.sqrt(3))],
										[(x0 + a0 / 2.0), (y0 - a0 / 2.0 / Math.sqrt(3))],
										[x0, (y0 - a0 / Math.sqrt(3))] ];
			bmg.fillStyle = c;
			bmg.beginPath();
			bmg.moveTo(pts[0][0], pts[0][1]);
			for (let k = 1; k < 6; k++)
			{
				bmg.lineTo(pts[k][0], pts[k][1]);
			}
			bmg.closePath();
			bmg.fill();

			// 강이 될 점의 쌍들을 리스트에 넣어둔다.
			if (y >= 0 && y < map.Height)
			{
				if (map.Rivers[EdgeType.Vertical][x][y].isRiver)
					RiverLines.push( [pts[0], pts[1]] );
				if (map.Rivers[EdgeType.LeftToRight][x][y].isRiver)
					RiverLines.push([pts[0], pts[5]]);
				if (map.Rivers[EdgeType.RightToLeft][x][y].isRiver)
					RiverLines.push([pts[5], pts[4]]);
			}
		}
	}
	
	// 기록해둔 점의 쌍들로 강을 그린다.
	bmg.strokeStyle = FromLegend(ToggleViewMode.ByAltitude, 1);
	bmg.lineWidth = 0.1 * _TileSize;
	bmg.lineCap = "round";
	bmg.beginPath();
	for (let i = 0; i < RiverLines.length; i++)
	{
		bmg.moveTo(RiverLines[i][0][0], RiverLines[i][0][1]);
		bmg.lineTo(RiverLines[i][1][0], RiverLines[i][1][1]);
	}
	bmg.stroke();
}

function DrawDebug()
{
	bmg.font = "bold 10px sans-serif";
	let metric = bmg.measureText(`${OldMouse}, ${OldSecondMouse}`);
	bmg.fillStyle = "rgba(255, 255, 255, 0.5)";
	bmg.fillRect(0, 0, metric.width + 10, 15);
	bmg.fillStyle = "black";
	bmg.fillText(`${OldMouse}, ${OldSecondMouse}`, 5, 10);
}
/*
let LoadingIncrement = 0;
function DrawLoadingScreen()
{
	let str = "Loading.";
	let i = LoadingIncrement;
	bmg.clearRect(0, 0, bf.width, bf.height);

	let dstr = str;
	for (let j = 0; j < i; j++)
		dstr += ".";
	//alert(dstr);
	bmg.font = "bold 40px sans-serif";
	bmg.fillText(dstr, 10, 50);
	
	canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
	canvas.getContext("2d").drawImage(bf, 0, 0);

	LoadingIncrement = Mod(i + 1, 4);
	setTimeout(DrawLoadingScreen, 500);
}
*/
function PixelToTile(PixelX, PixelY)
{
	let xdbl = Math.floor((PixelX + _CameraPosition[0] - _ScreenWidth / 2) * 2 / _TileSize);
	let xdev = PixelX + _CameraPosition[0] - _ScreenWidth / 2 - xdbl * _TileSize / 2;
	let ydev = 2 / Math.sqrt(3) * (xdev - _TileSize / 4) * (Mod(xdbl, 2) - 0.5);
	let yhalf = Math.floor((PixelY + _CameraPosition[1] - _ScreenHeight / 2 - ydev) / _TileSize / Math.sqrt(3));
	let y = yhalf * 2 + ((PixelY + _CameraPosition[1] - _ScreenHeight / 2 >= (yhalf + 0.5) * Math.sqrt(3) * _TileSize - ydev) ? 1 : 0);
	let x = Mod(Math.floor((xdbl - Mod(y, 2)) / 2), map.Width);
	return [x, y];
}

function TileToPixel(x, y)
{
	let PixelX = Mod((x + 0.5 * (Mod(y, 2) + 1)) * _TileSize - _CameraPosition[0] + 0.5 * map.Width * _TileSize, map.Width * _TileSize) + 0.5 * (_ScreenWidth - map.Width * _TileSize);
	let PixelY = (y + 0.5) * _TileSize * Math.sqrt(3) / 2 - _CameraPosition[1] + _ScreenHeight * 0.5;
	return [PixelX, PixelY];
}

function FromLegend(mode, value)
{
	if (mode == ToggleViewMode.ByTemperature)
		return FromHSV((30 - value) * 240 / 60, 1, 1);
	else if (mode == ToggleViewMode.ByPrecipitation)
		return FromHSV(Math.max(240 * Math.LN10(value * 0.01) / Math.LN10(50), 0), 1, 1);
	else if (mode == ToggleViewMode.ByAltitude)
	{
		switch (value)
		{
			case 0:
				return "rgb(0, 0, 50)";
			case 1:
				return "rgb(0, 50, 100)";
			case 2:
				return "rgb(48, 96, 0)";
			case 3:
				return "rgb(112, 149, 0)";
			case 4:
				return "rgb(96, 60, 0)";
			default:
				return "black"
		}
	}
	else
		return "black";
}

function ScrollMap(dx, dy)
{
	CameraPosition[0] = Mod(CameraPosition[0] + dx, map.Width * TileSize);
	CameraPosition[1] = AB(CameraPosition[1] + dy, document.body.clientHeight / 2 - TileSize * Math.sqrt(3) / 4, (map.Height + 0.5) * TileSize * Math.sqrt(3) / 2 - document.body.clientHeight / 2);
}

function FromHSV(Hue, Saturation, Value)
{
	let H = Mod(Hue / 60, 6);
	let C = Saturation * Value;
	let X = C * (1 - Math.abs(Mod(H, 2) - 1));
	let m = Value - C;

	if (H <= 1)
		return `rgb(${(255 * (C + m))}, ${(255 * (X + m))}, ${(255 * m)})`;
	else if (H <= 2)
		return `rgb(${(255 * (X + m))}, ${(255 * (C + m))}, ${(255 * m)})`;
	else if (H <= 3)
		return `rgb(${(255 * (0 + m))}, ${(255 * (C + m))}, ${(255 * (X + m))})`;
	else if (H <= 4)
		return `rgb(${(255 * (0 + m))}, ${(255 * (X + m))}, ${(255 * (C + m))})`;
	else if (H <= 5)
		return `rgb(${(255 * (X + m))}, ${(255 * (0 + m))}, ${(255 * (C + m))})`;
	else if (H <= 6)
		return `rgb(${(255 * (C + m))}, ${(255 * (0 + m))}, ${(255 * (X + m))})`;
	else
		return "black";
}

function InitializeGame()
{
	map = new Map(MAPWIDTH);
	CameraPosition = [map.PlayerPosition[0] * TileSize + TileSize / 2 * (Mod(map.PlayerPosition[1], 2) + 1),
					AB(map.PlayerPosition[1] * TileSize * Math.sqrt(3) / 2 + TileSize * Math.sqrt(3) / 4, document.body.clientHeight / 2 - TileSize * Math.sqrt(3) / 4, (map.Height + 0.5) * TileSize * Math.sqrt(3) / 2 - document.body.clientHeight / 2 + 1)];
}