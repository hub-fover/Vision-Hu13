# LAB 005 contracts

All lengths are metres and image coordinates are pixels after EXIF orientation.
The input stack has exactly five frames, ordered from near focus to far focus
when the camera exposes a focus index. Relative depth is normalised to `[0, 1]`
(`0` nearest in the stack, `1` farthest). A confidence below `0.45` is invalid;
`0.45..0.70` is reference quality and `>=0.70` is stable.

The machine-readable defaults and stable error codes live in
`lab-005/shared/contracts.json`. Python and JavaScript must preserve these
names when serialising reports.
