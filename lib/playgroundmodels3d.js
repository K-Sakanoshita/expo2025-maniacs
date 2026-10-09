"use strict";

// Optional procedural model factories for playground equipment.
const PlaygroundModelFactories = {
    horizontal_bar(T) {
        const group = new T.Group();
        const metal = new T.MeshStandardMaterial({
            color: 0x66757f,
            roughness: 0.65,
            metalness: 0.35
        });
        const postGeometry = new T.CylinderGeometry(0.06, 0.06, 1.9, 8);
        const barGeometry = new T.CylinderGeometry(0.045, 0.045, 1.4, 8);
        barGeometry.rotateZ(Math.PI / 2);

        [-2.1, -0.7, 0.7, 2.1].forEach(x => {
            const post = new T.Mesh(postGeometry, metal);
            post.position.set(x, 0.95, 0);
            group.add(post);
        });
        [
            { x: -1.4, y: 1.25 },
            { x: 0.0, y: 1.50 },
            { x: 1.4, y: 1.75 }
        ].forEach(spec => {
            const bar = new T.Mesh(barGeometry, metal);
            bar.position.set(spec.x, spec.y, 0);
            group.add(bar);
        });
        return group;
    },

    springy(T) {
        const group = new T.Group();
        const metal = new T.MeshStandardMaterial({
            color: 0x59636b,
            roughness: 0.6,
            metalness: 0.4
        });
        const bodyMaterial = new T.MeshStandardMaterial({ color: 0xe79a3b, roughness: 0.75 });

        const base = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 0.12, 10), metal);
        base.position.y = 0.06;
        group.add(base);

        const points = [];
        const turns = 4;
        const segments = 40;
        for (let i = 0; i <= segments; i += 1) {
            const f = i / segments;
            const a = f * Math.PI * 2 * turns;
            points.push(new T.Vector3(
                Math.cos(a) * 0.17,
                0.16 + f * 0.58,
                Math.sin(a) * 0.17
            ));
        }
        const spring = new T.Mesh(
            new T.TubeGeometry(new T.CatmullRomCurve3(points), 48, 0.045, 6, false),
            metal
        );
        group.add(spring);

        const support = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.24, 8), metal);
        support.position.y = 0.84;
        group.add(support);

        const body = new T.Mesh(new T.BoxGeometry(1.05, 0.28, 0.38), bodyMaterial);
        body.position.y = 1.03;
        group.add(body);
        const seat = new T.Mesh(new T.BoxGeometry(0.62, 0.10, 0.46), bodyMaterial);
        seat.position.set(-0.12, 1.21, 0);
        group.add(seat);

        const handleGeometry = new T.CylinderGeometry(0.035, 0.035, 0.72, 8);
        handleGeometry.rotateX(Math.PI / 2);
        const handle = new T.Mesh(handleGeometry, metal);
        handle.position.set(0.34, 1.30, 0);
        group.add(handle);
        const footGeometry = new T.CylinderGeometry(0.03, 0.03, 0.62, 8);
        footGeometry.rotateX(Math.PI / 2);
        const foot = new T.Mesh(footGeometry, metal);
        foot.position.set(-0.24, 0.94, 0);
        group.add(foot);
        return group;
    },

    basket_swing(T) {
        const group = new T.Group();
        const metal = new T.MeshStandardMaterial({
            color: 0x5f6b73,
            roughness: 0.6,
            metalness: 0.4
        });
        const rope = new T.MeshStandardMaterial({ color: 0x30343a, roughness: 0.9 });
        const seat = new T.MeshStandardMaterial({ color: 0x2f5f72, roughness: 0.8 });

        const beamBetween = (a, b, radius, material, segments = 8) => {
            const start = new T.Vector3(...a);
            const end = new T.Vector3(...b);
            const delta = end.clone().sub(start);
            const mesh = new T.Mesh(
                new T.CylinderGeometry(radius, radius, delta.length(), segments),
                material
            );
            mesh.position.copy(start).add(end).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(
                new T.Vector3(0, 1, 0),
                delta.clone().normalize()
            );
            group.add(mesh);
        };

        [-1.65, 1.65].forEach(x => {
            beamBetween([x, 0, -0.85], [x, 2.35, 0], 0.065, metal);
            beamBetween([x, 0, 0.85], [x, 2.35, 0], 0.065, metal);
        });
        beamBetween([-1.75, 2.35, 0], [1.75, 2.35, 0], 0.075, metal);

        const ring = new T.Mesh(new T.TorusGeometry(0.62, 0.055, 6, 20), seat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.82;
        group.add(ring);

        for (let i = 0; i < 8; i += 1) {
            const a = i * Math.PI / 8;
            beamBetween(
                [Math.cos(a) * 0.56, 0.82, Math.sin(a) * 0.56],
                [-Math.cos(a) * 0.56, 0.82, -Math.sin(a) * 0.56],
                0.012,
                rope,
                5
            );
        }
        [
            [-0.52, 2.30, 0, -0.48, 0.90, -0.34],
            [-0.52, 2.30, 0, -0.48, 0.90, 0.34],
            [0.52, 2.30, 0, 0.48, 0.90, -0.34],
            [0.52, 2.30, 0, 0.48, 0.90, 0.34]
        ].forEach(v => beamBetween(v.slice(0, 3), v.slice(3, 6), 0.018, rope, 6));
        return group;
    },

};
