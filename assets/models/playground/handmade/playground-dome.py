import bpy
import bmesh
import math
import os
from mathutils import Vector


# ============================================================
# playground=dome
# Blender 5.x
#
# ・半球状遊具
# ・中央アーチ入口
# ・U字型のひさし
# ・ターコイズ / オレンジ
# ・全周クライミングホールド
# ============================================================


# ============================================================
# PARAMETERS
# ============================================================

# ------------------------
# Dome
# ------------------------

RADIUS = 1.90
HEIGHT_SCALE = 0.72

SEGMENTS = 72
RINGS = 32

SHELL_THICKNESS = 0.055


# ------------------------
# Entrance
# ------------------------

DOOR_CX = 0.0

DOOR_HALF_WIDTH = 0.56
DOOR_SIDE_HEIGHT = 0.40

# 地面より少し下まで抜く
GROUND_PENETRATION = 0.12

DOOR_ARCH_SEGMENTS = 40


# ------------------------
# Hood
# ------------------------

RIM_WIDTH = 0.085

# 本体に少し食い込ませる
RIM_OVERLAP = 0.035

# 地面まで確実に届かせる
RIM_BOTTOM_Z = -0.015

# 左右脚部分の張り出し
RIM_SIDE_DEPTH = 0.10

# 頂上部分の張り出し
RIM_TOP_DEPTH = 0.30


# ------------------------
# Climbing holds
# ------------------------

BASE_HOLD_SIZE = 0.075

# 小さいほどドームへ深く埋まる
# 0.10ならかなり密着
HOLD_OUTSET_FACTOR = 0.10


# ------------------------
# Export
# ------------------------

EXPORT_GLB = True

EXPORT_PATH = "C:/tmp/playground_dome.glb"

# blendファイルと同じ場所なら:
# EXPORT_PATH = "//playground_dome.glb"


# ============================================================
# UTILITIES
# ============================================================

def delete_all():

    bpy.ops.object.select_all(
        action='SELECT'
    )

    bpy.ops.object.delete(
        use_global=False
    )


def apply_transform(obj):

    bpy.context.view_layer.objects.active = obj

    obj.select_set(True)

    bpy.ops.object.transform_apply(
        location=True,
        rotation=True,
        scale=True
    )


def apply_modifier(obj, modifier_name):

    bpy.context.view_layer.objects.active = obj

    obj.select_set(True)

    bpy.ops.object.modifier_apply(
        modifier=modifier_name
    )


def make_material(
    name,
    color,
    roughness=0.45
):

    mat = bpy.data.materials.new(
        name=name
    )

    mat.use_nodes = True

    # Solid View → Color: Material
    # でも色が見えるようにする
    mat.diffuse_color = (
        color[0],
        color[1],
        color[2],
        1.0
    )

    bsdf = mat.node_tree.nodes.get(
        "Principled BSDF"
    )

    if bsdf:

        bsdf.inputs[
            "Base Color"
        ].default_value = (
            color[0],
            color[1],
            color[2],
            1.0
        )

        bsdf.inputs[
            "Roughness"
        ].default_value = roughness

    return mat


# ============================================================
# MATERIALS
# ============================================================

def create_materials():

    mats = {}

    # 左側
    mats["teal"] = make_material(
        "Dome_Turquoise",
        (0.02, 0.69, 0.66),
        0.38
    )

    # 右側
    mats["orange"] = make_material(
        "Dome_Orange",
        (0.96, 0.40, 0.12),
        0.40
    )

    # ひさし
    mats["rim"] = make_material(
        "Entrance_Hood",
        (0.04, 0.78, 0.72),
        0.36
    )

    # ホールド
    mats["holds"] = [

        make_material(
            "Hold_Yellow",
            (0.95, 0.75, 0.12),
            0.65
        ),

        make_material(
            "Hold_Red",
            (0.88, 0.28, 0.20),
            0.65
        ),

        make_material(
            "Hold_Blue",
            (0.24, 0.53, 0.82),
            0.65
        ),

        make_material(
            "Hold_Purple",
            (0.62, 0.34, 0.73),
            0.65
        ),

        make_material(
            "Hold_Orange",
            (0.95, 0.55, 0.12),
            0.65
        ),

        make_material(
            "Hold_Green",
            (0.48, 0.66, 0.20),
            0.65
        ),
    ]

    return mats


# ============================================================
# DOME MATHEMATICS
# ============================================================

def dome_height():

    return RADIUS * HEIGHT_SCALE


def dome_horizontal_radius(z):

    h = dome_height()

    ratio = z / h

    if ratio >= 1.0:
        return 0.0

    return (
        RADIUS
        * math.sqrt(
            max(
                0.0,
                1.0 - ratio * ratio
            )
        )
    )


def dome_front_y(x, z):
    """
    x,z位置における
    ドーム前面(-Y側)のY座標
    """

    h = dome_height()

    value = (
        1.0
        - (x * x)
        / (RADIUS * RADIUS)
        - (z * z)
        / (h * h)
    )

    if value <= 0:
        return None

    return (
        -RADIUS
        * math.sqrt(value)
    )


def dome_normal(x, y, z):
    """
    楕円体表面の外向き法線
    """

    h = dome_height()

    normal = Vector((

        x / (RADIUS * RADIUS),

        y / (RADIUS * RADIUS),

        z / (h * h)

    ))

    return normal.normalized()


# ============================================================
# CREATE DOME
# ============================================================

def create_dome_shell():

    bpy.ops.mesh.primitive_uv_sphere_add(

        segments=SEGMENTS,

        ring_count=RINGS,

        radius=RADIUS,

        location=(0, 0, 0)
    )

    dome = bpy.context.active_object

    dome.name = "playground_dome"


    # --------------------------------------------------------
    # 下半球削除
    # --------------------------------------------------------

    bm = bmesh.new()

    bm.from_mesh(
        dome.data
    )

    remove = [

        v for v in bm.verts

        if v.co.z < -0.00001
    ]

    bmesh.ops.delete(

        bm,

        geom=remove,

        context='VERTS'
    )


    # 微妙な誤差を0へ
    for v in bm.verts:

        if abs(v.co.z) < 0.0001:

            v.co.z = 0.0


    bm.to_mesh(
        dome.data
    )

    bm.free()


    # --------------------------------------------------------
    # 高さを潰す
    # --------------------------------------------------------

    dome.scale.z = HEIGHT_SCALE

    apply_transform(
        dome
    )

    return dome


# ============================================================
# SOLIDIFY
# ============================================================

def add_shell_thickness(dome):

    solid = dome.modifiers.new(

        name="ShellThickness",

        type='SOLIDIFY'
    )

    solid.thickness = (
        SHELL_THICKNESS
    )

    # 外形を変えず内側へ
    solid.offset = -1.0

    solid.use_even_offset = True

    solid.use_quality_normals = True

    apply_modifier(
        dome,
        "ShellThickness"
    )


# ============================================================
# DOOR CUTTER
#
# 2Dアーチ形状をY方向へ押し出した
# 完全に閉じた立体。
# ============================================================

def create_door_cutter():

    contour = []

    bottom_z = (
        -GROUND_PENETRATION
    )


    # --------------------------------------------------------
    # 左下
    # --------------------------------------------------------

    contour.append((

        DOOR_CX
        - DOOR_HALF_WIDTH,

        bottom_z
    ))


    # --------------------------------------------------------
    # 半円アーチ
    #
    # π = 左下側
    # 0 = 右下側
    # --------------------------------------------------------

    for i in range(
        DOOR_ARCH_SEGMENTS + 1
    ):

        theta = (

            math.pi

            - math.pi
            * i
            / DOOR_ARCH_SEGMENTS
        )

        x = (

            DOOR_CX

            + DOOR_HALF_WIDTH
            * math.cos(theta)
        )

        z = (

            DOOR_SIDE_HEIGHT

            + DOOR_HALF_WIDTH
            * math.sin(theta)
        )

        contour.append(
            (x, z)
        )


    # --------------------------------------------------------
    # 右下
    # --------------------------------------------------------

    contour.append((

        DOOR_CX
        + DOOR_HALF_WIDTH,

        bottom_z
    ))


    # --------------------------------------------------------
    # Y方向
    #
    # 前からドーム内部まで確実に貫通。
    # 後ろ側のシェルまでは抜かない。
    # --------------------------------------------------------

    y_front = (
        -RADIUS
        - 0.75
    )

    y_back = 0.65


    verts = []

    faces = []

    count = len(contour)


    # 前面
    for x, z in contour:

        verts.append((
            x,
            y_front,
            z
        ))


    # 背面
    for x, z in contour:

        verts.append((
            x,
            y_back,
            z
        ))


    # 前キャップ
    faces.append(

        tuple(
            range(count)
        )
    )


    # 後キャップ
    faces.append(

        tuple(
            reversed(
                range(
                    count,
                    count * 2
                )
            )
        )
    )


    # 側面
    for i in range(count):

        j = (
            i + 1
        ) % count

        faces.append((

            i,

            j,

            count + j,

            count + i
        ))


    mesh = bpy.data.meshes.new(
        "DoorCutterMesh"
    )

    mesh.from_pydata(
        verts,
        [],
        faces
    )

    mesh.validate()

    mesh.update()


    cutter = bpy.data.objects.new(

        "door_cutter",

        mesh
    )

    bpy.context.collection.objects.link(
        cutter
    )

    return cutter


# ============================================================
# CUT ENTRANCE
# ============================================================

def cut_opening(dome):

    cutter = (
        create_door_cutter()
    )

    boolean = dome.modifiers.new(

        name="DoorBoolean",

        type='BOOLEAN'
    )

    boolean.operation = (
        'DIFFERENCE'
    )

    boolean.solver = 'EXACT'

    boolean.object = cutter


    apply_modifier(
        dome,
        "DoorBoolean"
    )


    bpy.data.objects.remove(

        cutter,

        do_unlink=True
    )


# ============================================================
# FINAL DOME SURFACE
# ============================================================

def finish_dome(dome):

    bevel = dome.modifiers.new(

        name="DomeBevel",

        type='BEVEL'
    )

    bevel.width = 0.010

    bevel.segments = 2

    bevel.limit_method = 'ANGLE'


    apply_modifier(
        dome,
        "DomeBevel"
    )


    # Blender 5でも利用可能なら
    try:

        weighted = dome.modifiers.new(

            name="DomeWeightedNormal",

            type='WEIGHTED_NORMAL'
        )

        weighted.keep_sharp = True

        apply_modifier(
            dome,
            "DomeWeightedNormal"
        )

    except Exception:

        pass


    bpy.context.view_layer.objects.active = dome

    bpy.ops.object.shade_smooth()


# ============================================================
# DOME MATERIALS
#
# Boolean後に設定するため、
# 新しく生成された穴の面も灰色にならない。
# ============================================================

def assign_dome_materials(
    dome,
    mats
):

    dome.data.materials.clear()

    dome.data.materials.append(
        mats["teal"]
    )

    dome.data.materials.append(
        mats["orange"]
    )


    dome.data.update()


    for poly in dome.data.polygons:

        cx = poly.center.x

        # 左 = turquoise
        if cx < 0.0:

            poly.material_index = 0

        # 右 = orange
        else:

            poly.material_index = 1


# ============================================================
# HOOD PATH
#
# ひさし形状は前回のものを維持。
# ============================================================

def make_rim_path(
    radius,
    side_height
):

    points = []


    # 左脚下
    points.append((

        DOOR_CX - radius,

        RIM_BOTTOM_Z,

        0.0
    ))


    # 左脚上
    points.append((

        DOOR_CX - radius,

        side_height,

        0.0
    ))


    steps = 36


    # 上部アーチ
    for i in range(
        1,
        steps
    ):

        theta = (

            math.pi

            - math.pi
            * i
            / steps
        )

        x = (

            DOOR_CX

            + radius
            * math.cos(theta)
        )

        z = (

            side_height

            + radius
            * math.sin(theta)
        )


        # 頂上 = 1
        # 左右 = 0
        factor = (
            math.sin(theta)
            ** 1.4
        )


        points.append((

            x,

            z,

            factor
        ))


    # 右脚上
    points.append((

        DOOR_CX + radius,

        side_height,

        0.0
    ))


    # 右脚下
    points.append((

        DOOR_CX + radius,

        RIM_BOTTOM_Z,

        0.0
    ))


    return points


# ============================================================
# CREATE HOOD
# ============================================================

def create_hood_rim(mats):

    inner = make_rim_path(

        DOOR_HALF_WIDTH,

        DOOR_SIDE_HEIGHT
    )


    outer = make_rim_path(

        DOOR_HALF_WIDTH
        + RIM_WIDTH,

        DOOR_SIDE_HEIGHT
    )


    verts = []

    faces = []


    rear_inner = []
    rear_outer = []

    front_inner = []
    front_outer = []


    count = len(inner)


    for i in range(count):

        ix, iz, factor = inner[i]

        ox, oz, outer_factor = outer[i]


        iy = dome_front_y(

            ix,

            max(0.0, iz)
        )


        oy = dome_front_y(

            ox,

            max(0.0, oz)
        )


        if iy is None:

            iy = -RADIUS


        if oy is None:

            oy = -RADIUS


        # 本体へ食い込ませる
        iy_rear = (
            iy + RIM_OVERLAP
        )

        oy_rear = (
            oy + RIM_OVERLAP
        )


        # 上部だけ大きく前へ張り出す
        inner_depth = (

            RIM_SIDE_DEPTH

            + (
                RIM_TOP_DEPTH
                - RIM_SIDE_DEPTH
            )
            * factor
        )


        outer_depth = (

            RIM_SIDE_DEPTH

            + (
                RIM_TOP_DEPTH
                - RIM_SIDE_DEPTH
            )
            * outer_factor
        )


        iy_front = (
            iy_rear
            - inner_depth
        )

        oy_front = (
            oy_rear
            - outer_depth
        )


        # rear inner
        rear_inner.append(
            len(verts)
        )

        verts.append((
            ix,
            iy_rear,
            iz
        ))


        # rear outer
        rear_outer.append(
            len(verts)
        )

        verts.append((
            ox,
            oy_rear,
            oz
        ))


        # front inner
        front_inner.append(
            len(verts)
        )

        verts.append((
            ix,
            iy_front,
            iz
        ))


        # front outer
        front_outer.append(
            len(verts)
        )

        verts.append((
            ox,
            oy_front,
            oz
        ))


    # --------------------------------------------------------
    # Faces
    # --------------------------------------------------------

    for i in range(
        count - 1
    ):

        j = i + 1


        # rear
        faces.append((

            rear_inner[i],

            rear_inner[j],

            rear_outer[j],

            rear_outer[i]
        ))


        # front
        faces.append((

            front_inner[i],

            front_outer[i],

            front_outer[j],

            front_inner[j]
        ))


        # inside
        faces.append((

            rear_inner[i],

            front_inner[i],

            front_inner[j],

            rear_inner[j]
        ))


        # outside
        faces.append((

            rear_outer[i],

            rear_outer[j],

            front_outer[j],

            front_outer[i]
        ))


    # 左端
    faces.append((

        rear_inner[0],

        rear_outer[0],

        front_outer[0],

        front_inner[0]
    ))


    # 右端
    k = count - 1

    faces.append((

        rear_inner[k],

        front_inner[k],

        front_outer[k],

        rear_outer[k]
    ))


    mesh = bpy.data.meshes.new(
        "EntranceHoodMesh"
    )

    mesh.from_pydata(
        verts,
        [],
        faces
    )

    mesh.validate()

    mesh.update()


    hood = bpy.data.objects.new(

        "entrance_hood",

        mesh
    )


    bpy.context.collection.objects.link(
        hood
    )


    hood.data.materials.append(
        mats["rim"]
    )


    for poly in hood.data.polygons:

        poly.material_index = 0

        poly.use_smooth = True


    bevel = hood.modifiers.new(

        name="HoodBevel",

        type='BEVEL'
    )

    bevel.width = 0.007

    bevel.segments = 2

    bevel.limit_method = 'ANGLE'


    apply_modifier(
        hood,
        "HoodBevel"
    )


    return hood


# ============================================================
# DOOR TEST
#
# ホールドを入口周辺に置かないため。
# ============================================================

def point_inside_door(
    x,
    z,
    margin=0.0
):

    half_width = (
        DOOR_HALF_WIDTH
        + margin
    )


    dx = abs(
        x - DOOR_CX
    )


    if dx > half_width:

        return False


    if z <= (
        DOOR_SIDE_HEIGHT
        + margin
    ):

        return True


    value = (

        half_width
        * half_width

        - dx
        * dx
    )


    if value <= 0:

        return False


    top = (

        DOOR_SIDE_HEIGHT

        + math.sqrt(value)
    )


    return (
        z <= top + margin
    )


# ============================================================
# CREATE ONE HOLD
# ============================================================

def create_hold(
    theta_deg,
    z,
    size,
    material
):

    h = dome_height()


    if z <= 0:

        return


    if z >= h:

        return


    horizontal_radius = (
        dome_horizontal_radius(z)
    )


    theta = math.radians(
        theta_deg
    )


    x = (

        horizontal_radius
        * math.cos(theta)
    )

    y = (

        horizontal_radius
        * math.sin(theta)
    )


    # --------------------------------------------------------
    # 入口とひさしの周辺は避ける
    # 前面 = y < 0
    # --------------------------------------------------------

    if y < -0.45:

        if point_inside_door(
            x,
            z,
            margin=0.16
        ):

            return


    # 表面法線
    normal = dome_normal(
        x,
        y,
        z
    )


    surface = Vector((
        x,
        y,
        z
    ))


    # --------------------------------------------------------
    # ドームへかなり食い込ませる
    #
    # 石のlocal Z半径は
    # 約 size * 0.55。
    #
    # 中心をsize*0.10しか出さないため
    # 約0.45*sizeがドーム内部へ入り、
    # 空中には浮かない。
    # --------------------------------------------------------

    position = (

        surface

        + normal
        * (
            size
            * HOLD_OUTSET_FACTOR
        )
    )


    bpy.ops.mesh.primitive_ico_sphere_add(

        subdivisions=1,

        radius=size,

        location=position
    )


    hold = bpy.context.active_object

    hold.name = "climbing_hold"


    # 岩らしい形
    hold.scale = (

        1.15,

        0.90,

        0.55
    )


    bpy.ops.object.transform_apply(

        location=False,

        rotation=False,

        scale=True
    )


    # local Zを外向き法線へ
    hold.rotation_euler = (

        normal
        .to_track_quat(
            'Z',
            'Y'
        )
        .to_euler()
    )


    hold.data.materials.append(
        material
    )


    for poly in hold.data.polygons:

        poly.use_smooth = True


# ============================================================
# HOLDS
#
# 下 → 上
# ほぼ360°全周へ配置。
#
# 各段を少しずつ回転させ、
# 縦一直線の人工的な配置を避ける。
# ============================================================

def create_climbing_holds(mats):

    materials = mats["holds"]


    # (高さ, 個数, 回転オフセット)
    levels = [

        (0.23, 14,   0),

        (0.40, 14,  13),

        (0.58, 14,   2),

        (0.76, 13,  16),

        (0.94, 12,   4),

        (1.10, 10,  17),

        (1.22,  8,   2),

        (1.30,  6,  18),
    ]


    counter = 0


    for level_index, (
        base_z,
        count,
        offset_deg
    ) in enumerate(levels):


        for i in range(count):

            angle = (

                offset_deg

                + (
                    360.0
                    * i
                    / count
                )
            )


            # 少し上下をばらけさせる
            z = (

                base_z

                + 0.018
                * math.sin(
                    math.radians(
                        angle * 2.3
                        + level_index * 31
                    )
                )
            )


            # サイズにも少し変化
            size = (

                BASE_HOLD_SIZE

                + 0.008
                * (
                    0.5
                    + 0.5
                    * math.sin(
                        math.radians(
                            angle * 3.1
                            + level_index * 47
                        )
                    )
                )
            )


            material = (

                materials[
                    counter
                    % len(materials)
                ]
            )


            create_hold(

                angle,

                z,

                size,

                material
            )


            counter += 1


# ============================================================
# LIGHT
# ============================================================

def create_light():

    bpy.ops.object.light_add(

        type='SUN',

        location=(
            4,
            -5,
            6
        )
    )


    sun = bpy.context.active_object

    sun.name = "Sun"

    sun.data.energy = 2.3


# ============================================================
# EXPORT
# ============================================================

def export_glb(path):

    filepath = bpy.path.abspath(path)

    directory = os.path.dirname(filepath)

    if directory:
        os.makedirs(
            directory,
            exist_ok=True
        )

    # 念のため全マテリアルの表示色を完全不透明にする
    for mat in bpy.data.materials:

        if mat is None:
            continue

        c = mat.diffuse_color

        mat.diffuse_color = (
            c[0],
            c[1],
            c[2],
            1.0
        )

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',

        use_selection=False,

        # ★今回のポイント
        # Blender上で見えているMaterial Colorを
        # シンプルなglTFマテリアルとして出力する
        export_materials='VIEWPORT',

        export_normals=True,
        export_yup=True,
        export_animations=False
    )

    print(
        "Exported:",
        filepath
    )

# ============================================================
# MAIN
# ============================================================

delete_all()

mats = create_materials()


# 1. 半球
dome = create_dome_shell()


# 2. 先に厚みを付ける
add_shell_thickness(
    dome
)


# 3. 厚み込みで入口を抜く
cut_opening(
    dome
)


# 4. Boolean後に仕上げ
finish_dome(
    dome
)


# 5. Booleanで増えた面を含め、
#    全面へ改めて色を割り当てる
assign_dome_materials(
    dome,
    mats
)


# 6. 現在の形を維持したひさし
hood = create_hood_rim(
    mats
)


# 7. 下から頂上付近まで全周ホールド
create_climbing_holds(
    mats
)


# 8. Lighting
create_light()


# 9. GLB
if EXPORT_GLB:

    export_glb(
        EXPORT_PATH
    )